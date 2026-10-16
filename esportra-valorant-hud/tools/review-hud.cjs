// Render the real overlay in hidden Electron windows without writing to a match room.
// From the repository root: node_modules\electron\dist\electron.exe esportra-valorant-hud/tools/review-hud.cjs
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const labelArg = process.argv.find(arg => arg.startsWith('--label='));
const label = labelArg ? labelArg.slice(8).replace(/[^a-z0-9_-]/gi, '') : 'review';
const scenarioArg = process.argv.find(arg => arg.startsWith('--scenario='));
const output = path.resolve(__dirname, '../previews/review');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});

async function render(scenario) {
  const win = new BrowserWindow({
    show: false, frame: false, width: scenario.width, height: scenario.height, useContentSize: true,
    webPreferences: {
      offscreen: true, backgroundThrottling: false, nodeIntegration: false,
      contextIsolation: true, sandbox: true, partition: 'hud-review-' + scenario.name,
    },
  });
  win.setContentSize(scenario.width, scenario.height);
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  await win.loadFile(path.resolve(__dirname, '../overlays/' + (scenario.overlay || 'ingame') + '.html'), {query:{review:String(Date.now())}});
  if (scenario.reducedMotion) {
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  }
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const start = Date.now(); const poll = () => window.HUD_READY ? resolve() : Date.now() - start > 10000 ? reject(new Error('HUD did not boot')) : setTimeout(poll, 25); poll();
  })`);
  await win.webContents.executeJavaScript(`(async () => {
    const config = ${JSON.stringify(scenario)};
    const state = JSON.parse(JSON.stringify(window.HUD_DEFAULT));
    const now = Date.now(); HUD.now = () => now;
    Object.assign(state.round, { phase: config.phase || 'buy', endsAt: now + (config.seconds ?? 26) * 1000 });
    if (config.teamColors) state.teams.forEach((team,index)=>{team.color=config.teamColors[index];team.score=12;});
    state.show.economy = 'auto'; state.show.ticker = false; state.show.sponsor = false;
    state.show.scoreboard = false; state.show.teamCompare = false; state.show.duel = false;
    state.banner = { type: '', ts: 0 }; state.killfeed = [];
    state.prevCredits = state.players.map(team => team.map(p => p.credits + 1400));
    if (config.name === 'buy-credit-changes') {
      state.prevCredits[0][0] = state.players[0][0].credits;
      state.prevCredits[0][1] = 0;
      state.prevCredits[0][2] = null;
    }
    if (config.phase === 'end') {
      // Deliberately conspicuous stand-in for the game's native ability HUD.
      const native = document.createElement('div');
      native.style.cssText='position:absolute;left:0;right:0;bottom:0;height:110px;background:#00ff80;color:#fff;text-align:center;font:40px sans-serif';
      native.textContent='NATIVE GAME ABILITIES';document.body.insertBefore(native,document.querySelector('#hud'));
    }
    if (config.rounds) { state.rounds = Array.from({length: config.rounds}, (_, i) => ({w: i % 2, how: ['elim', 'boom', 'defuse', 'time'][i % 4]})); state.round.number = config.rounds + 1; }
    HUD.commit(state, {local: true});
    if (config.backdrop === 'map') {
      const background = new Image();
      const loaded = new Promise(resolve => { background.onload = resolve; background.onerror = resolve; });
      background.src = VCAT.maps.LOTUS.splash;
      await Promise.race([loaded, new Promise(resolve => setTimeout(resolve, 10000))]);
      document.body.style.background = '#243447 url(' + background.src + ') center/cover';
    } else document.body.style.background = config.backdrop;
    await document.fonts.ready;
    await Promise.race([Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.addEventListener('load', resolve, {once:true}); img.addEventListener('error', resolve, {once:true}); }))), new Promise(resolve => setTimeout(resolve, 10000))]);
    await new Promise(resolve => setTimeout(resolve, 900));
  })()`);
  const report = await win.webContents.executeJavaScript(`(async () => {
    const rect = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    const violations = [];
    const expected = ${JSON.stringify([scenario.width,scenario.height])};
    if (innerWidth !== expected[0] || innerHeight !== expected[1]) violations.push('Viewport size differs from the requested review resolution');
    document.querySelectorAll('.ec .rw').forEach((row, i) => {
      const bounds = rect(row), cells = Array.from(row.children).map(rect);
      cells.forEach((cell, j) => { if (cell.x < bounds.x - 1 || cell.right > bounds.right + 1 || cell.y < bounds.y - 1 || cell.bottom > bounds.bottom + 1) violations.push('Buy row ' + i + ' cell ' + j + ' exceeds its row'); if (j && cell.x < cells[j-1].right - 1) violations.push('Buy row ' + i + ' cells overlap'); });
      row.querySelectorAll('img').forEach(img => { const image = rect(img); if (image.width > bounds.width || image.height > bounds.height + 1) violations.push('Buy row ' + i + ' oversized image'); });
    });
    const headers = Array.from(document.querySelectorAll('.rh-head .num'));
    const rows = document.querySelectorAll('.rh-row');
    const cells = rows.length ? Array.from(rows[0].querySelectorAll('.c')) : [];
    headers.forEach((header, i) => { if (cells[i] && Math.abs(rect(header).x - rect(cells[i]).x) > 1) violations.push('Round header ' + i + ' is misaligned'); });
    const board = document.querySelector('.ec'), history = document.querySelector('.rh');
    if (board && history && history.classList.contains('buy') && rect(history).bottom > rect(board).y) violations.push('History overlaps the buy board');
    const timer = document.querySelector('.sb-mid .tm'), observed = document.querySelector('.ob');
    const visible = el => el && el.closest('.mod').classList.contains('on');
    if (visible(board)) {
      board.querySelectorAll('.weapon img').forEach(img=>{
        const flip=getComputedStyle(img).transform;
        const direction=flip==='none'?1:new DOMMatrix(flip).a;
        if (direction !== (img.closest('.l')?-1:1)) violations.push('Buy-phase weapon does not point inward');
      });
      if (${JSON.stringify(scenario.name)} === 'buy-credit-changes') {
        const changes=Array.from(board.querySelectorAll('.l .change'));
        const expected=['—','+2,900','—','-1,400'];
        expected.forEach((value,index)=>{if(changes[index].textContent!==value)violations.push('Credit change is wrong for player '+index);});
      }
    }
    const recap=document.querySelector('.rr');
    if (visible(recap)) {
      const bounds=rect(recap),style=getComputedStyle(recap);
      if (bounds.x!==0 || Math.abs(bounds.width-innerWidth)>1 || Math.abs(bounds.bottom-innerHeight)>1) violations.push('Recap does not cover the full bottom of the game');
      if (style.backgroundColor!=='rgb(16, 15, 18)' || style.opacity!=='1') violations.push('Recap background is not solid');
      ['.ob','.pl','.ec'].forEach(selector=>{if(visible(document.querySelector(selector)))violations.push('Another player overlay remains visible during recap');});
      if (bounds.height < 110*innerWidth/1920) violations.push('Recap is too short to cover native abilities');
    }
    const timerStability = [];
    if (visible(timer)) {
      if (${JSON.stringify(scenario.name)}.startsWith('scorebug-gradients')) {
        document.querySelectorAll('.sb-name,.sb-score').forEach(panel=>{
          const style=getComputedStyle(panel);
          if(!style.backgroundImage.includes('linear-gradient')) violations.push('Team gradient did not render');
          if(panel.classList.contains('sb-score') && style.color!=='rgb(255, 255, 255)') violations.push('Score is not white over its gradient');
        });
        if(Math.abs(rect(document.querySelector('.sb-row')).y)>1) violations.push('Gradient scorebug gained a top gap');
      }
      const bounds = rect(timer);
      if (Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2) > 1) violations.push('Timer is not centered on the game viewport');
      const panel = rect(timer.parentElement);
      if (Math.abs(bounds.y + bounds.height / 2 - panel.y - panel.height / 2) > 1) violations.push('Timer or spike is not vertically centered in its panel');
      const urgent = HUD.state.round.phase === 'live' && HUD.timeLeft(HUD.state.round) <= 15;
      if (getComputedStyle(timer).color !== (urgent ? 'rgb(224, 68, 94)' : 'rgb(255, 255, 255)')) violations.push('Timer color does not match its countdown state');
      if (HUD.state.round.phase === 'planted') {
        if (timer.textContent.trim()) violations.push('Planted timer shows text beside the spike icon');
        if (!getComputedStyle(timer, '::before').backgroundImage.includes('Spike_top_light.svg')) violations.push('Red planted spike asset is missing');
        if (document.body.dataset.modules === 'ingame' && document.querySelector('.sk')) violations.push('Ingame shows a second spike timer');
        const originalNow = HUD.now, beat = HUD.state.round.endsAt - 26000;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animationName = reduced ? 'spike-heartbeat-reduced' : 'spike-heartbeat';
        const animation = timer.getAnimations({subtree:true}).find(item => item.animationName === animationName);
        if (!animation) throw new Error('Spike heartbeat animation is missing');
        animation.pause();
        const delay = animation.effect.getTiming().delay;
        const sample = offset => {
          animation.currentTime = offset + delay;
          const style = getComputedStyle(timer, '::before');
          return {opacity:Number(style.opacity),scale:style.transform === 'none' ? 1 : new DOMMatrix(style.transform).a};
        };
        const rest = sample(0), peak = sample(150), middle = sample(75), next = sample(1150);
        if (Math.abs(next.scale - peak.scale) > .001 || Math.abs(next.opacity - peak.opacity) > .001) violations.push('Spike heartbeat does not repeat on each shared second');
        if (!(middle.opacity > rest.opacity && middle.opacity < peak.opacity)) violations.push('Spike heartbeat brightness is not smooth');
        if (reduced ? peak.scale !== 1 : !(peak.scale > middle.scale && middle.scale > rest.scale)) violations.push('Spike heartbeat scale does not respect motion preferences');
        const iconStyle = getComputedStyle(timer, '::before');
        if (parseFloat(iconStyle.height) * peak.scale > timer.offsetHeight + 1) violations.push('Spike heartbeat clips vertically at its peak');
        HUD.mods.forEach(mod => mod.tick && mod.tick(HUD.state));
        if (!timer.getAnimations({subtree:true}).includes(animation)) violations.push('HUD ticks restart the heartbeat animation');
        // A source opened between beats must pick up the existing phase immediately.
        HUD.now = () => beat + 450;
        const source = document.createElement('div'); document.querySelector('#hud').appendChild(source);
        const fresh = HUD.modules.spiketimer(source); fresh.update(HUD.state);
        const freshIcon = source.querySelector('.tm'); getComputedStyle(freshIcon, '::before').opacity;
        const freshAnimation = freshIcon.getAnimations({subtree:true}).find(item => item.animationName === animationName);
        if (!freshAnimation) throw new Error('Fresh spike heartbeat animation is missing');
        freshAnimation.pause(); freshAnimation.currentTime = 0;
        if (freshAnimation.effect.getTiming().delay !== -450 || Math.abs(Number(getComputedStyle(freshIcon, '::before').opacity) - rest.opacity) > .001) violations.push('A fresh spike source restarts the pulse');
        source.remove(); HUD.now = originalNow; HUD.mods.forEach(mod => mod.tick && mod.tick(HUD.state));
        sample(150);
      }
      if (${JSON.stringify(scenario.name)}.startsWith('timer-final-15')) {
        const saved = {...HUD.state.round}, now = HUD.now();
        const states = [
          ['live',15.01,'rgb(255, 255, 255)','0:16'],
          ['live',15,'rgb(224, 68, 94)','15:00'],
          ['live',14.99,'rgb(224, 68, 94)','14:99'],
          ['live',9.87,'rgb(224, 68, 94)','09:87'],
          ['live',1,'rgb(224, 68, 94)','01:00'],
          ['live',0.01,'rgb(224, 68, 94)','00:01'],
          ['live',0,'rgb(224, 68, 94)','00:00'],
          ['buy',15,'rgb(255, 255, 255)','0:15'],
          ['buy',9.87,'rgb(255, 255, 255)','0:10'],
          ['buy',0,'rgb(255, 255, 255)','0:00'],
          ['paused',9,'rgb(255, 255, 255)','PAUSE'],
          ['end',0,'rgb(255, 255, 255)','0:00'],
          ['live',90,'rgb(255, 255, 255)','1:30'],
        ];
        states.forEach(([phase,seconds,color,text])=>{
          Object.assign(HUD.state.round,{phase,endsAt:now+seconds*1000});
          HUD.mods.forEach(mod=>mod.tick && mod.tick(HUD.state));
          if (getComputedStyle(timer).color!==color || timer.textContent!==text) violations.push('Timer threshold or reset failed: '+phase+' '+seconds);
        });
        // Scan every hundredth: the whole seconds and separator must stay fixed.
        const characterCenter = index => {
          const walker = document.createTreeWalker(timer,NodeFilter.SHOW_TEXT);
          let node,offset=index;
          while (node=walker.nextNode()) {
            if (offset<node.textContent.length) {
              const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+1);
              const bounds=range.getBoundingClientRect();return bounds.x+bounds.width/2;
            }
            offset-=node.textContent.length;
          }
          throw new Error('Timer character not found');
        };
        for(let hundredths=0;hundredths<100;hundredths++) {
          Object.assign(HUD.state.round,{phase:'live',endsAt:now+14000+hundredths*10});
          HUD.mods.forEach(mod=>mod.tick && mod.tick(HUD.state));
          timerStability.push({text:timer.textContent,seconds:[characterCenter(0),characterCenter(1)],separator:characterCenter(2)});
        }
        const first=timerStability[0];
        if(timerStability.some(sample=>Math.abs(sample.separator-first.separator)>.1 || sample.seconds.some((x,index)=>Math.abs(x-first.seconds[index])>.1))) violations.push('Subsecond updates shift the whole seconds or separator horizontally');
        // A frame between the slower module ticks must update hundredths in both sources.
        HUD.now = () => now;
        Object.assign(HUD.state.round,{phase:'live',endsAt:now+14990});
        const source = document.createElement('div'); document.querySelector('#hud').appendChild(source);
        const standalone = HUD.modules.scorebug(source); standalone.update(HUD.state);
        const freshTimer = source.querySelector('.tm');
        HUD.now = () => now+20;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        standalone.frame(HUD.state);
        if (timer.textContent !== '14:97' || freshTimer.textContent !== '14:97') violations.push('Hundredths do not update between regular ticks');
        HUD.now = () => now; source.remove();
        Object.assign(HUD.state.round,saved);HUD.mods.forEach(mod=>mod.tick && mod.tick(HUD.state));
      }
    }
    if (visible(observed) && Math.abs(rect(observed).bottom - innerHeight) > 1) violations.push('Observed player card leaves a bottom gap');
    return {viewport:[innerWidth,innerHeight],timer:timer && {bounds:rect(timer),color:getComputedStyle(timer).color,text:timer.textContent},timerStability,observed:visible(observed) ? rect(observed) : null,board:board && rect(board),history:history && rect(history),rowCount:document.querySelectorAll('.ec .rw').length,headerCount:headers.length,violations,failedImages:Array.from(document.images).filter(img=>img.src && (!img.complete || !img.naturalWidth)).map(img=>img.src)};
  })()`);
  report.errors = errors;
  const png = await win.webContents.capturePage();
  const file = path.join(output, label + '-' + scenario.name + '.png');
  fs.writeFileSync(file, png.toPNG());
  fs.writeFileSync(path.join(output, label + '-' + scenario.name + '.json'), JSON.stringify(report, null, 2));
  win.destroy();
  return { name: scenario.name, file, ...report };
}

app.whenReady().then(async () => {
  fs.mkdirSync(output, {recursive:true});
  const scenarios = [
    {name:'buy-white-1080',width:1920,height:1080,backdrop:'#ffffff'},
    {name:'buy-map-720',width:1280,height:720,backdrop:'map'},
    {name:'buy-credit-changes',width:1280,height:720,backdrop:'map'},
    {name:'recap-map-720',width:1280,height:720,backdrop:'map',phase:'end'},
    {name:'recap-source',overlay:'round-recap',width:1920,height:1080,backdrop:'#283646',phase:'end'},
    {name:'live-map-720',width:1280,height:720,backdrop:'map',phase:'live'},
    {name:'scorebug-gradients-brand',overlay:'scorebug',width:1920,height:1080,backdrop:'map',phase:'live',seconds:54},
    {name:'scorebug-gradients-custom',overlay:'scorebug',width:1920,height:1080,backdrop:'#ffffff',phase:'live',seconds:54,teamColors:['#ff0000','#20d000']},
    {name:'timer-final-15',width:1280,height:720,backdrop:'map',phase:'live',seconds:15},
    {name:'timer-final-15-source',overlay:'scorebug',width:1920,height:1080,backdrop:'#283646',phase:'live',seconds:15},
    {name:'timer-buy-final-15',width:1280,height:720,backdrop:'map',phase:'buy',seconds:15},
    {name:'live-map-1080',width:1920,height:1080,backdrop:'map',phase:'live'},
    {name:'spike-map-720',width:1280,height:720,backdrop:'map',phase:'planted'},
    {name:'spike-map-1080',width:1920,height:1080,backdrop:'map',phase:'planted'},
    {name:'spike-source',overlay:'spike-timer',width:1920,height:1080,backdrop:'#283646',phase:'planted'},
    {name:'spike-reduced',width:1920,height:1080,backdrop:'#283646',phase:'planted',reducedMotion:true},
    {name:'buy-overtime',width:1920,height:1080,backdrop:'#283646',rounds:35},
    {name:'economy-source',overlay:'economy',width:1920,height:1080,backdrop:'#ffffff'},
  ];
  const reports = [];
  for (const scenario of scenarios.filter(item => !scenarioArg || item.name === scenarioArg.slice(11))) { const report = await render(scenario); reports.push(report); console.log(JSON.stringify({name:report.name,file:report.file,violations:report.violations,errors:report.errors,failedImages:report.failedImages.length})); }
  const reportName = scenarioArg ? label + '-' + scenarioArg.slice(11) + '-report.json' : label + '-report.json';
  fs.writeFileSync(path.join(output, reportName), JSON.stringify(reports, null, 2));
  app.exit(reports.some(report => report.violations.length || report.errors.length || report.failedImages.length) ? 1 : 0);
}).catch(error => { console.error(error); app.exit(1); });
