const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('the workspace rail carries the account block with sign out', () => {
  const shell = read('src/renderer/components/air/WorkspaceShell.jsx');
  const rail = read('src/renderer/components/air/AccountRail.jsx');
  assert.ok(shell.includes('<AccountRail />'), 'AirShell must render the account block in the rail');
  assert.match(rail, /Sign out/);
  assert.match(rail, /bc-rail-account/);
  assert.match(rail, /projects\??\.logout\(\)/, 'sign out must call the session logout IPC');
  // A signed-out rail keeps an explicit entry to the sign-in gate.
  assert.match(rail, /navigate\("signin"\)/);
});

test('sign out returns to the account gate and refreshes status', () => {
  const rail = read('src/renderer/components/air/AccountRail.jsx');
  const logoutBody = rail.slice(rail.indexOf('async function signOut'));
  assert.match(logoutBody, /navigate\("signin"\)/, 'the gate must be the next surface after sign out');
  assert.match(logoutBody, /refresh\(\)/, 'status must refresh so the gate renders');
  assert.match(logoutBody, /result\?\.ok === false/, 'IPC failures must surface as an inline error');
});

test('every signed-out production desk lands on the account gate', () => {
  const app = read('src/renderer/App.jsx');
  assert.match(app, /activeScreen === 'signin'/);
  assert.match(app, /<PairScreen[\s\S]*?onSignedIn/);
  // Signed out → the gate is the entry for every production desk, even with a
  // legacy node key still stored (pairing retired; the account is the link).
  assert.match(app, /!airStatus\.airAccount\?\.authenticated[\s\S]*?airStatus\.mode !== 'capture-only'[\s\S]*?<PairScreen/);
  assert.doesNotMatch(app, /airStatus\.paired === false/, 'stored node keys must not bypass the gate');
  // Capture-only observers open capture without an account.
  assert.match(app, /airStatus\?\.mode === 'capture-only'\) \{/);
});

test('the sign-in gate offers account creation, not pairing', () => {
  const gate = read('src/renderer/components/PairScreen.jsx');
  assert.match(gate, /Create an Esportra account/);
  assert.match(gate, /openSignup/);
  assert.match(gate, /projectsApi\.login\(email, password\)/);
  assert.doesNotMatch(gate, /\bPAIR\b/, 'the gate must never call the retired pairing IPC');
  assert.doesNotMatch(gate, /join with a code|76-character|8-character/i);
});

test('capture-only workstations get a sign-in entry while signed out', () => {
  const capture = read('src/renderer/components/CaptureScreen.jsx');
  const app = read('src/renderer/App.jsx');
  assert.match(capture, /onSignIn/);
  assert.match(app, /onSignIn=\{airStatus\.airAccount\?\.authenticated === false/);
});

test('logout clears the session, the stored show context and the known-account flag', () => {
  const ipc = read('src/air-session-ipc.js');
  const logoutBody = ipc.slice(ipc.indexOf('mutation(commands.AIR_LOGOUT'), ipc.indexOf('mutation(commands.AIR_ACCESS_REFRESH'));
  assert.match(logoutBody, /assertAccountIdle\(\)/, 'accounts may only change on an idle workstation');
  assert.match(logoutBody, /clearStandalone\(\)/, 'an independent account show must be cleared');
  assert.match(logoutBody, /getSession\(\)\.logout\(\)/);
  assert.match(logoutBody, /config\(\)\.set\("airAccountKnown", false\)/);
  const preload = read('src/preload.js');
  assert.match(preload, /login:\(email,password\)=>ipcRenderer\.invoke\('AIR_LOGIN'/);
  assert.match(preload, /logout:\(\)=>ipcRenderer\.invoke\('AIR_LOGOUT'\)/);
});

test('stale pairing copy is gone from user-facing guards', () => {
  assert.doesNotMatch(read('src/veto-client.js'), /[Pp]air this/);
  assert.doesNotMatch(read('src/sponsor-ledger.js'), /[Pp]air this/);
  const liveConsole = read('src/renderer/components/LiveConsolePage.jsx');
  assert.doesNotMatch(liveConsole, /Pairing codes are created/, 'live console copy must not point at retired pairing codes');
  const main = read('src/main.js');
  assert.doesNotMatch(main, /'Pair this computer/, 'sponsor/restore guards must not mention pairing');
  assert.doesNotMatch(main, /'Pair this PC /);
  assert.match(read('src/veto-client.js'), /Sign in with your Esportra account/);
});

test('the completion smoke walks the whole account loop', () => {
  const smoke = read('tools/air-completion-smoke.cjs');
  assert.match(smoke, /Sign in to Esportra Air/, 'the gate screen must be exercised');
  assert.match(smoke, /Sign out/, 'sign out must be exercised from the rail');
  assert.match(smoke, /authenticated/, 'signed-out status must be asserted');
});
