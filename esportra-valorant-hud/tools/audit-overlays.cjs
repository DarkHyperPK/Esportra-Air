// Audit actual HTTP-served overlays in an isolated room; never touch the running show.
'use strict';
const {app, BrowserWindow} = require('electron');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'previews/audit');
const label = (process.argv.find(a => a.startsWith('--label=')) || '--label=audit').slice(8).replace(/[^a-z0-9_-]/gi, '');
const filter = (process.argv.find(a => a.startsWith('--only=')) || '--only=').slice(7).split(',').filter(Boolean);
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'core/state.default.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, 'core/state.clean.js'), 'utf8'), sandbox);
const clone = state => JSON.parse(JSON.stringify(state));
const files = fs.readdirSync(path.join(root, 'overlays')).filter(f => f.endsWith('.html'));
const gates = {players:'players', observed:'observed', minimap:'minimap', economy:'economy', scoreboard:'scoreboard', lowerthird:'lowerThird', replay:'replay', ticker:'ticker', roundhistory:'roundHistory', winprob:'winProb', spiketimer:'spikeTimer', moments:'moments', sponsor:'sponsor', eventbug:'eventBug', poll:'poll', duel:'duel', teamcompare:'teamCompare', roundrecap:'roundRecap', playercams:'playerCams', scorebug:'scorebug'};
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});

function fixture(modules, now) {
  const state = clone(sandbox.window.HUD_DEFAULT);
  Object.assign(state.round, {phase:'live', endsAt:now + 84000});
  Object.assign(state.show, {economy:false, scoreboard:false, duel:false, teamCompare:false, roundRecap:false, lowerThird:false, replay:false, poll:false, playerCams:false, minimap:false});
  for (const mod of modules) if (gates[mod]) state.show[gates[mod]] = true;
  if (modules.includes('economy')) state.round.phase = 'buy';
  if (modules.includes('spiketimer')) {state.round.phase = 'planted'; state.round.endsAt = now + 26000;}
  if (modules.includes('roundrecap')) state.round.phase = 'end';
  state.killfeed.forEach((kill, i) => kill.ts = now - 1500 + i * 100);
  if (modules.includes('moments')) state.killfeed.push({...state.killfeed[2], victim:[0,4], ts:now - 100});
  if (modules.includes('banner')) Object.assign(state.banner, {type:'ace', team:1, player:0, ts:now - 100, hold:4200});
  if (modules.includes('toast')) state.toast.ts = now - 100;
  if (modules.includes('stinger')) state.stinger = now - 960;
  return state;
}

const measureSource = `(() => {
  const visible = el => {
    const bounds = el.getBoundingClientRect();
    if (!bounds.width || !bounds.height || bounds.right <= 0 || bounds.bottom <= 0 || bounds.x >= innerWidth || bounds.y >= innerHeight) return false;
    for (let parent = el; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) < .01) return false;
    }
    return true;
  };
  const texts = [], clipped = [], walker = document.createTreeWalker(document.querySelector('#hud'), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, value = node.textContent.trim(), el = node.parentElement;
    if (!value || !visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(node); const r = range.getBoundingClientRect();
    if (r.width && r.height && r.right > 0 && r.bottom > 0 && r.x < innerWidth && r.y < innerHeight) {
      texts.push(value);
      if (!el.closest('.chrome,.tk') && (r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) clipped.push({text:value, x:r.x,y:r.y,right:r.right,bottom:r.bottom});
    }
  }
  return {ready:!!window.HUD_READY, connected:!!HUD.connected, modules:document.body.dataset.modules, visibleText:texts, clippedText:clipped,
    visibleImages:Array.from(document.images).filter(img => visible(img) && img.naturalWidth).length,
    failedImages:Array.from(document.images).filter(img => img.getAttribute('src') && (!img.complete || !img.naturalWidth)).map(img => img.src),
    plantedIcons:Array.from(document.querySelectorAll('.tm.planted')).filter(visible).length};
})()`;

async function waitFor(win, expression, ms=5000) {
  return win.webContents.executeJavaScript(`new Promise(resolve => {const start=Date.now(); const poll=()=>{if (${expression}) resolve(true);else if(Date.now()-start>${ms}) resolve(false);else setTimeout(poll,25);};poll();})`);
}

async function update(win, state, now) {
  await win.webContents.executeJavaScript(`HUD.now=()=>${now}; HUD.commit(${JSON.stringify(state)}, {local:true}); HUD.mods.forEach(mod=>mod.tick && mod.tick(HUD.state));`);
  await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,1100))`);
}

function paintedPixels(image) {
  const pixels=image.getBitmap(); let painted=0;
  for (let i=0;i<pixels.length;i+=4) if (Math.abs(pixels[i]-43)>8 || Math.abs(pixels[i+1]-36)>8 || Math.abs(pixels[i+2]-32)>8) painted++;
  return painted;
}

async function audit(file, port) {
  const html = fs.readFileSync(path.join(root,'overlays',file),'utf8');
  const modules = html.match(/data-modules="([^"]*)"/)[1].split(',');
  const report = {file,modules,errors:[],warnings:[],violations:[],default:null,active:null,clean:null,updates:{}};
  const win = new BrowserWindow({show:false,frame:false,width:1280,height:720,useContentSize:true,
    webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'audit-'+file}});
  win.setContentSize(1280,720);
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3 && !message.startsWith('Failed to load resource')) report.errors.push(message);
    else if (level >= 2) report.warnings.push(message);
  });
  try {
    await win.loadURL('http://127.0.0.1:'+port+'/overlays/'+file+'?match=AUDIT');
    if (!await waitFor(win,'window.HUD_READY && window.HUD.connected',2500)) report.violations.push('Overlay did not boot and connect to the isolated server');
    await win.webContents.executeJavaScript(`document.body.style.background='#20242b'; window.addEventListener('error',e=>console.error(e.message));`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,1100))`);
    report.default = await win.webContents.executeJavaScript(measureSource);
    report.default.paintedPixels=paintedPixels(await win.webContents.capturePage());
    const inactive=['banner','duel','economy','lowerthird','minimap','moments','playercams','poll','replay','roundhistory','roundrecap','scoreboard','spiketimer','stinger','teamcompare','toast'];
    if (modules.every(mod=>inactive.includes(mod)) && report.default.paintedPixels>10) report.violations.push('Source paints while its default visibility condition is inactive');
    const now = Date.now(), state = fixture(modules,now);
    const missing = await win.webContents.executeJavaScript(`(${JSON.stringify(modules)}).filter(name=>!HUD.modules[name])`);
    if (missing.length) report.violations.push('Missing modules: '+missing.join(', '));
    await update(win,state,now);
    await win.webContents.executeJavaScript(`Promise.race([Promise.all([document.fonts.ready,...Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});}))]),new Promise(resolve=>setTimeout(resolve,8000))])`);
    if (modules.includes('stinger')) await win.webContents.executeJavaScript('new Promise(resolve=>setTimeout(()=>{window.stingerAt(.96);setTimeout(resolve,100);},1000))');
    report.active = await win.webContents.executeJavaScript(measureSource);
    if (report.active.clippedText.length) report.violations.push('Active text extends beyond the viewport');
    const png = await win.webContents.capturePage();
    report.active.paintedPixels=paintedPixels(png);
    if (report.active.paintedPixels<10) report.violations.push('Active state renders no visible pixels');
    fs.writeFileSync(path.join(output,label+'-'+file.replace('.html','.png')),png.toPNG());

    if (modules.includes('spiketimer')) {
      const hidden=clone(state); hidden.show.spikeTimer=false;
      await update(win,hidden,now);
      if (paintedPixels(await win.webContents.capturePage())>10) report.violations.push('Spike source ignores its visibility toggle');
      await update(win,state,now+450);
      const phase=await win.webContents.executeJavaScript(`parseFloat(document.querySelector('.tm').style.getPropertyValue('--spike-delay'))`);
      if (Math.abs(phase+450)>1) report.violations.push('Re-enabled spike source restarts its heartbeat phase');
      const ended=clone(state); ended.round.phase='end'; await update(win,ended,now);
      if (paintedPixels(await win.webContents.capturePage())>10) report.violations.push('Spike source remains visible after the round ends');
    }

    // Verify scene updates which are absent from the general redraw signature.
    if (modules.includes('holding')) {
      const changed=clone(state); changed.holding.mode='brb'; changed.holding.message='AUDIT HOLDING UPDATE';
      await update(win,changed,now);
      const result=await win.webContents.executeJavaScript(`document.querySelector('.ho .sub').textContent`);
      report.updates.holding=result;
      if (file==='holding.html' && result!=='AUDIT HOLDING UPDATE') report.violations.push('Holding mode/message edits do not redraw');
    }
    if (modules.includes('champion')) {
      const changed=clone(state); changed.champion.team=0; await update(win,changed,now);
      report.updates.champion=await win.webContents.executeJavaScript(`document.querySelector('.ch .t').textContent`);
      if (report.updates.champion!==state.teams[0].name) report.violations.push('Champion override does not redraw');
    }
    if (modules.includes('halftime') || modules.includes('mapbreakdown')) {
      const changed=clone(state); changed.teamStats[0].plants=42; changed.firstSide=['DEF','ATK']; await update(win,changed,now);
      const text=await win.webContents.executeJavaScript(`document.querySelector('.mb .side').textContent`);
      report.updates.breakdown=text;
      if (!text.includes('42')) report.violations.push('Breakdown statistics edits do not redraw');
    }
    // A fresh-show state must not throw, even when its names and scene data are empty.
    const clean=clone(sandbox.window.HUD_CLEAN);
    if (modules.includes('economy')) clean.show.economy=true;
    for (const mod of modules) if (gates[mod]) clean.show[gates[mod]]=true;
    if (modules.includes('spiketimer')) {clean.round.phase='planted';clean.round.endsAt=now+26000;}
    if (modules.includes('observed') || modules.includes('players') || modules.includes('sponsor') || modules.includes('moments')) {clean.round.phase='live';clean.show.economy=false;}
    await update(win,clean,now);
    report.clean=await win.webContents.executeJavaScript(measureSource);
    // Preview must work with live flags disabled and must never join a live match room.
    await win.loadURL('http://127.0.0.1:'+port+'/overlays/'+file+'?preview=1&match=AUDIT');
    if (!await waitFor(win,'window.HUD_READY',2500)) report.violations.push('Sample preview did not boot');
    await win.webContents.executeJavaScript(`document.body.style.background='#20242b';new Promise(resolve=>setTimeout(resolve,1400))`);
    if (modules.includes('stinger')) {
      if (!await waitFor(win,"Number(getComputedStyle(document.querySelector('.sg .lg')).opacity) > .5",3500)) report.violations.push('Stinger preview never reaches its visible cut point');
      // Hold the cut point for the gallery after checking the real preview loop.
      await win.webContents.executeJavaScript('const renderStinger=window.stingerAt;window.stingerAt=()=>renderStinger(.96);window.stingerAt();new Promise(resolve=>setTimeout(resolve,100))');
    }
    report.preview=await win.webContents.executeJavaScript(measureSource);
    report.preview.isolated=await win.webContents.executeJavaScript('HUD.preview && !HUD.live && !HUD.match && !HUD.connected');
    if (!report.preview.isolated) report.violations.push('Preview connects to live match state');
    const preview=await win.webContents.capturePage();
    report.preview.paintedPixels=paintedPixels(preview);
    // Do not let the sample label satisfy the overlay's own visibility check.
    if (!report.preview.visibleText.length && !report.preview.visibleImages && !report.preview.plantedIcons && !modules.includes('stinger')) report.violations.push('Sample preview has no overlay content');
    fs.writeFileSync(path.join(output,label+'-preview-'+file.replace('.html','.png')),preview.toPNG());
  } catch (error) {report.violations.push(error.message);}
  finally {win.destroy();}
  fs.writeFileSync(path.join(output,label+'-'+file.replace('.html','.json')),JSON.stringify(report,null,2));
  console.log(JSON.stringify({file,defaultPixels:report.default?.paintedPixels,activePixels:report.active?.paintedPixels,previewIsolated:report.preview?.isolated,violations:report.violations,errors:report.errors,failedImages:report.active?.failedImages}));
  return report;
}

async function gallery(reports) {
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const pages=[];
  for (let start=0;start<reports.length;start+=9) pages.push('<section class="page" data-page="'+(pages.length+1)+'">'+reports.slice(start,start+9).map(report=>{
    const image=label+'-preview-'+report.file.replace('.html','.png');
    return '<article><h2>'+escape(report.file)+' <span>'+((report.violations.length || report.errors.length) ? 'ISSUE' : 'PASS')+'</span></h2><a href="'+image+'"><img src="'+image+'" alt="'+escape(report.file)+' sample preview"></a></article>';
  }).join('')+'</section>');
  const file=path.join(output,label+'-gallery.html');
  fs.writeFileSync(file,'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Esportra overlay audit</title><style>body{margin:0;background:#11151b;color:#e9edf3;font:14px Arial,sans-serif}header{padding:16px 18px}h1{margin:0;font-size:20px}p{margin:6px 0 0;color:#aeb8c5}.page{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:0 18px 18px}article{min-width:0;background:#20242b;border:1px solid #343d4b}h2{margin:0;padding:8px 10px;font-size:13px}h2 span{float:right;color:#7ee0a0;font-size:10px}img{width:100%;display:block}a{display:block}</style></head><body><header><h1>Esportra · '+reports.length+' overlay previews</h1><p>Each source is shown with sample data in its intended state. Click a preview to inspect it at full size.</p></header>'+pages.join('')+'<script>const page=new URLSearchParams(location.search).get("page");if(page)document.querySelectorAll(".page").forEach(el=>{if(el.dataset.page!==page)el.remove()});</script></body></html>');
  const win=new BrowserWindow({show:false,frame:false,width:1280,height:900,useContentSize:true,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.setContentSize(1280,900);
  try {
    for (let i=1;i<=pages.length;i++) {
      await win.loadFile(file,{query:{page:String(i)}});
      await win.webContents.executeJavaScript('Promise.all(Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve})))');
      fs.writeFileSync(path.join(output,label+'-gallery-'+i+'.png'),(await win.webContents.capturePage()).toPNG());
    }
  } finally {win.destroy();}
}

app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const {start}=require(path.join(root,'server/server.js'));
  const port=18300;
  const handle=await start({port,key:'isolated-overlay-audit',root,dataDir:path.join(output,'isolated-state')});
  const reports=[];
  try {for (const file of files.filter(file=>!filter.length || filter.includes(file.replace('.html','')))) reports.push(await audit(file,port));}
  finally {handle.stop();}
  const reportFile=path.join(output,label+'-report.json');
  let combined=reports;
  if (filter.length && fs.existsSync(reportFile)) {
    const old=JSON.parse(fs.readFileSync(reportFile,'utf8'));
    combined=files.map(file=>reports.find(report=>report.file===file) || old.find(report=>report.file===file)).filter(Boolean);
  }
  fs.writeFileSync(reportFile,JSON.stringify(combined,null,2));
  await gallery(combined);
  app.exit(reports.some(report=>report.violations.length || report.errors.length) ? 1 : 0);
}).catch(error=>{console.error(error);app.exit(1);});
