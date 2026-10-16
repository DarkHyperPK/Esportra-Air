// Exercise the real control button and WebSocket delivery, without touching a live show.
'use strict';
const {app, BrowserWindow} = require('electron');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'previews/stinger-review');
const label = (process.argv.find(arg=>arg.startsWith('--label=')) || '--label=review').slice(8).replace(/[^a-z0-9_-]/gi,'');
const port = 18301, key = 'isolated-stinger-review', windows = [], errors = [];
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.on('window-all-closed',()=>{});
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(win, expression, ms=4000) {
  return win.webContents.executeJavaScript(`new Promise(resolve=>{const started=performance.now();const poll=()=>{if(${expression})resolve(true);else if(performance.now()-started>${ms})resolve(false);else setTimeout(poll,10);};poll();})`);
}
async function open(file) {
  const win = new BrowserWindow({show:false,frame:false,width:1280,height:720,useContentSize:true,
    webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'stinger-review-'+file}});
  windows.push(win);win.setContentSize(1280,720);
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3 && !message.startsWith('Failed to load resource'))errors.push(file+': '+message);});
  await win.loadURL(`http://127.0.0.1:${port}/${file}?match=STINGER&key=${key}`);
  if(!await waitFor(win,'window.HUD_READY && HUD.connected'))throw new Error(file+' did not connect');
  await win.webContents.executeJavaScript(`document.body.style.background='#20242b'`);
  return win;
}
const visible = `document.querySelector('.sg .lg') && Number(getComputedStyle(document.querySelector('.sg .lg')).opacity)>.8`;
async function patch(state) {
  const response = await fetch(`http://127.0.0.1:${port}/api/STINGER`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Esportra-Key':key},body:JSON.stringify(state)});
  if(!response.ok)throw new Error('Isolated state patch failed: '+response.status);
}
async function settled(win) {
  return win.webContents.executeJavaScript(`(() => {
    const sg=document.querySelector('.sg');if(!sg)return false;
    return Number(getComputedStyle(sg.querySelector('.lg')).opacity)===0 &&
      Array.from(sg.querySelectorAll('.w')).every(el=>el.getBoundingClientRect().left>innerWidth);
  })()`);
}
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const {start}=require(path.join(root,'server/server.js'));
  const server=await start({port,key,root,dataDir:path.join(output,'isolated-state')});
  const report={checks:{},errors,violations:[]};
  const check=(name,passed)=>{report.checks[name]=!!passed;if(!passed)report.violations.push(name);};
  try {
    await patch({stinger:0,round:{phase:'live'},show:{economy:false,roundRecap:false}});
    const control=await open('control.html');
    const ingame=await open('overlays/ingame.html');
    const standalone=await open('overlays/stinger.html');
    await delay(300);
    check('ingame has stinger',await ingame.webContents.executeJavaScript(`!!document.querySelector('.sg')`));
    await control.webContents.executeJavaScript(`document.querySelector('[data-act="stinger"]').click()`);
    const [livePlayed,sourcePlayed]=await Promise.all([waitFor(ingame,visible,1800),waitFor(standalone,visible,1800)]);
    check('control button plays ingame',livePlayed);check('control button plays standalone',sourcePlayed);
    const state=await (await fetch(`http://127.0.0.1:${port}/api/STINGER`)).json();
    check('control trigger reaches server',state.state.stinger>Date.now()-3000);
    await delay(1400);
    check('standalone clears after playback',await settled(standalone));
    check('ingame clears after playback',await settled(ingame));

    await control.webContents.executeJavaScript(`document.querySelector('[data-act="stinger"]').click()`);
    await delay(1300);
    check('wipe remains visible past the old duration',!await settled(ingame) && !await settled(standalone));
    await delay(900);
    check('two-second wipe finishes cleanly',await settled(ingame) && await settled(standalone));

    // Restart in the middle of a wipe: only the newest frame loop may keep running.
    await control.webContents.executeJavaScript(`document.querySelector('[data-act="stinger"]').click()`);
    await delay(250);
    await control.webContents.executeJavaScript(`document.querySelector('[data-act="stinger"]').click()`);
    const replayed=await Promise.all([waitFor(ingame,visible,1800),waitFor(standalone,visible,1800)]);
    check('rapid retrigger plays both',replayed.every(Boolean));
    await delay(1400);
    check('rapid retrigger leaves no cover',await settled(ingame) && await settled(standalone));

    // Receiving a stale persisted trigger on reload must not flash a transition.
    const staleTrigger=Date.now()-10000;
    await patch({stinger:staleTrigger});
    await standalone.loadURL(standalone.webContents.getURL());
    await waitFor(standalone,`window.HUD_READY && HUD.connected && HUD.state.stinger===${staleTrigger}`);
    check('stale snapshot stays transparent',!await waitFor(standalone,visible,1400));

    // A new trigger must start locally even when the sender's clock is behind.
    await patch({stinger:Date.now()-2000});
    const delayed=await Promise.all([waitFor(ingame,visible,1800),waitFor(standalone,visible,1800)]);
    check('new delayed trigger still plays',delayed.every(Boolean));
    await delay(1400);

    const card=await ingame.webContents.executeJavaScript(`(() => {const card=document.querySelector('.ob'),r=card.getBoundingClientRect();return {bottom:r.bottom,height:r.height,viewport:innerHeight,abilities:card.querySelectorAll('.ab,.slot').length};})()`);
    report.observed=card;
    check('observed card flush bottom',Math.abs(card.bottom-card.viewport)<1);
    check('observed card includes ability strip',card.abilities===5);
    await control.webContents.executeJavaScript(`document.querySelector('[data-act="stinger"]').click()`);
    if(await waitFor(ingame,visible,1800)) {
      fs.writeFileSync(path.join(output,label+'-stinger.png'),(await ingame.webContents.capturePage()).toPNG());
      check('stinger above scorebug',await ingame.webContents.executeJavaScript(`Number(getComputedStyle(document.querySelector('.sg').parentElement).zIndex)>Number(getComputedStyle(document.querySelector('.scorebug-layer')).zIndex)`));
    }
    await delay(1400);
    fs.writeFileSync(path.join(output,label+'-observed.png'),(await ingame.webContents.capturePage()).toPNG());
  } catch(error) {report.violations.push(error.message);}
  finally {windows.forEach(win=>win.destroy());server.stop();}
  fs.writeFileSync(path.join(output,label+'-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  app.exit(report.violations.length || errors.length ? 1 : 0);
}).catch(error=>{console.error(error);app.exit(1);});
