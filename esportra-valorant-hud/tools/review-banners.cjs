// Verify theme selection and real banner triggers against an isolated HUD server.
'use strict';
const {app, BrowserWindow} = require('electron');
const fs = require('fs'), path = require('path');
const motionOnly=process.argv.includes('--motion-only');
const themes=['broadcast','compact','monument','impact'];
const themeArg=process.argv.find(arg=>arg.startsWith('--theme='));
const motionTheme=themeArg?themeArg.slice(8):'compact';
if(!themes.includes(motionTheme))throw new Error('Unsupported review theme');
const reviewThemes=themeArg?[motionTheme]:themes;
const root = path.resolve(__dirname,'..'), output = path.join(root,motionOnly?(motionTheme==='compact'?'previews/banner-motion':'previews/banner-motion-'+motionTheme):'previews/banner-review');
const port=motionOnly?18302+Math.max(1,themes.indexOf(motionTheme)):18302, key='isolated-banner-review', windows=[], errors=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');
app.on('window-all-closed',()=>{});
async function waitFor(win,expression,ms=4000) {
  return win.webContents.executeJavaScript(`new Promise(resolve=>{const started=performance.now();const poll=()=>{if(${expression})resolve(true);else if(performance.now()-started>${ms})resolve(false);else setTimeout(poll,20);};poll();})`);
}
async function open(file,query='match=BANNERS') {
  const win=new BrowserWindow({show:false,frame:false,width:1280,height:720,useContentSize:true,
    webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'banner-review-'+windows.length}});
  windows.push(win);win.setContentSize(1280,720);
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3 && !message.startsWith('Failed to load resource'))errors.push(file+': '+message);});
  await win.loadURL(`http://127.0.0.1:${port}/${file}?${query}`);
  if(!await waitFor(win,query.includes('preview=1')?'window.HUD_READY':'window.HUD_READY && HUD.connected'))throw new Error(file+' failed to boot');
  await win.webContents.executeJavaScript(`(async()=>{
    document.body.style.background='#283646';
    if(window.VCAT && document.querySelector('#hud')) {
      const map=new Image();map.src=VCAT.maps.LOTUS.splash;
      await Promise.race([new Promise(resolve=>{if(map.complete)resolve();else {map.onload=resolve;map.onerror=resolve;}}),new Promise(resolve=>setTimeout(resolve,6000))]);
      document.body.style.background='#283646 url('+map.src+') center/cover';
    }
    await document.fonts.ready;
  })()`);
  return win;
}
async function patch(state) {
  const response=await fetch(`http://127.0.0.1:${port}/api/BANNERS`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Esportra-Key':key},body:JSON.stringify(state)});
  if(!response.ok)throw new Error('Isolated patch failed');
}
const measure=`(() => {
  const bn=document.querySelector('.bn'),pause=document.querySelector('.pause'),title=bn.querySelector('.t1'),footer=bn.querySelector('.bn-footer');
  const r=bn.getBoundingClientRect();
  return {theme:['monument','impact'].find(theme=>bn.classList.contains(theme)) || (bn.classList.contains('compact')?'compact':'broadcast'),on:bn.classList.contains('on'),title:title.textContent,
    side:bn.querySelector('.bn-side').textContent,team:bn.querySelector('.bn-team-name').textContent,actor:bn.querySelector('.bn-actor').textContent,
    width:r.width,center:r.x+r.width/2,titleFits:title.scrollWidth<=title.clientWidth+1,footerFits:footer.scrollWidth<=footer.clientWidth+1,
    emblem:bn.querySelector('.bn-emblem').naturalWidth,pause:pause.classList.contains('on'),pauseTheme:pause.classList.contains('compact'),
    failedImages:Array.from(document.images).filter(img=>img.getAttribute('src') && (!img.complete || !img.naturalWidth)).map(img=>img.src)};
})()`;
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const {start}=require(path.join(root,'server/server.js'));
  const server=await start({port,key,root,dataDir:path.join(output,'isolated-state')});
  const report={checks:{},cases:[],errors,violations:[]};
  const check=(name,passed)=>{report.checks[name]=!!passed;if(!passed)report.violations.push(name);};
  try {
    const fixture={window:{}};
    require('vm').runInNewContext(fs.readFileSync(path.join(root,'core/state.default.js'),'utf8'),fixture);
    const reset=await fetch(`http://127.0.0.1:${port}/api/BANNERS`,{method:'PUT',headers:{'Content-Type':'application/json','X-Esportra-Key':key},body:JSON.stringify(fixture.window.HUD_DEFAULT)});
    if(!reset.ok)throw new Error('Isolated fixture reset failed');
    if(motionOnly) {
      await patch({layout:{bannerTheme:motionTheme},banner:{type:'',ts:0},stinger:0,round:{phase:'live',endsAt:Date.now()+84000},killfeed:[],show:{economy:false,roundRecap:false,observed:false}});
      const control=await open('control.html','match=BANNERS&key='+key), source=await open('overlays/ingame.html');
      await control.webContents.executeJavaScript(`document.querySelector('[data-bn="flawless"]').click()`);
      await waitFor(source,`document.querySelector('.bn').classList.contains('on')`);
      const animations=await source.webContents.executeJavaScript(`(()=>{
        const now=HUD.now();HUD.now=()=>now;
        const bn=document.querySelector('.bn');getComputedStyle(bn).opacity;
        window.bannerAnimations=bn.getAnimations({subtree:true});
        const items=bannerAnimations.map(animation=>({property:animation.transitionProperty,delay:animation.effect.getTiming().delay,target:animation.effect.target.className}));
        bannerAnimations.forEach(animation=>{animation.pause();animation.currentTime=0;});return items;
      })()`);
      const footerClass=motionTheme==='broadcast'?'t2 mono':'bn-footer';
      check('panel emblem title and footer animate separately',['band','bn-crest','t1',footerClass].every(cls=>animations.some(a=>a.target===cls && a.property==='transform')));
      check('title and team row have staggered entrances',animations.some(a=>a.target==='t1' && a.delay===80) && animations.some(a=>a.target===footerClass && a.delay===120));
      for(const ms of [...Array.from({length:16},(_,index)=>index*20),380]) {
        await source.webContents.executeJavaScript(`bannerAnimations.forEach(animation=>animation.currentTime=${ms})`);
        const stage=await source.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn');return {parent:Number(getComputedStyle(bn).opacity),title:Number(getComputedStyle(bn.querySelector('.t1')).opacity),footer:Number(getComputedStyle(bn.querySelector('${motionTheme==='broadcast'?'.t2':'.bn-footer'}')).opacity)};})()`);
        report.cases.push({phase:'entrance',ms,...stage});
        fs.writeFileSync(path.join(output,'in-'+String(ms).padStart(3,'0')+'.png'),(await source.webContents.capturePage()).toPNG());
      }
      check('entrance finishes with all content visible',report.cases.at(-1).parent===1 && report.cases.at(-1).title===1 && report.cases.at(-1).footer===1);
      check('team row waits until the title enters',report.cases.find(c=>c.ms===80).footer===0 && report.cases.find(c=>c.ms===160).title>report.cases.find(c=>c.ms===160).footer);
      await source.webContents.executeJavaScript(`(()=>{bannerAnimations.forEach(animation=>animation.finish());HUD.now=()=>HUD.state.banner.ts+HUD.state.banner.hold+1;HUD.mods.forEach(mod=>mod.tick && mod.tick(HUD.state));const bn=document.querySelector('.bn');getComputedStyle(bn).opacity;window.bannerAnimations=bn.getAnimations({subtree:true});bannerAnimations.forEach(animation=>{animation.pause();animation.currentTime=0;});HUD.now=()=>HUD.state.banner.ts;})()`);
      for(const ms of Array.from({length:13},(_,index)=>index*20)) {
        await source.webContents.executeJavaScript(`bannerAnimations.forEach(animation=>animation.currentTime=${ms})`);
        fs.writeFileSync(path.join(output,'out-'+String(ms).padStart(3,'0')+'.png'),(await source.webContents.capturePage()).toPNG());
      }
      check('expiry fades out',await source.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.bn')).opacity==='0'`));
      // Retrigger during the exit: CSS transitions retarget from their current values.
      await source.webContents.executeJavaScript(`bannerAnimations.forEach(animation=>animation.currentTime=80);void(HUD.now=()=>Date.now());`);
      const interrupted=await source.webContents.executeJavaScript(`Number(getComputedStyle(document.querySelector('.bn')).opacity)`);
      await control.webContents.executeJavaScript(`document.querySelector('[data-bn="ace"]').click()`);
      await waitFor(source,`HUD.state.banner.type==='ace' && !document.querySelector('.bn').classList.contains('out')`);
      const resumed=await source.webContents.executeJavaScript(`Number(getComputedStyle(document.querySelector('.bn')).opacity)`);
      check('retrigger does not flash invisible',interrupted>0 && resumed>=interrupted-.01);
      await delay(400);
      fs.writeFileSync(path.join(output,'retrigger.png'),(await source.webContents.capturePage()).toPNG());
      check('retrigger settles on the new title',await source.webContents.executeJavaScript(`document.querySelector('.bn .t1').textContent==='ACE' && getComputedStyle(document.querySelector('.bn')).opacity==='1'`));
      check('late source restores without replaying its entrance',await source.webContents.executeJavaScript(`(()=>{HUD.now=()=>HUD.state.banner.ts+750;const root=document.createElement('div');document.querySelector('#hud').appendChild(root);const banner=HUD.modules.banner(root);banner.update(HUD.state,{snapshot:true});const bn=root.querySelector('.bn');const ready=bn.classList.contains('restored') && getComputedStyle(bn.querySelector('.t1')).opacity==='1' && !bn.getAnimations({subtree:true}).some(animation=>animation.transitionProperty || animation.animationName);root.remove();return ready;})()`));
      source.webContents.debugger.attach('1.3');
      await source.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await control.webContents.executeJavaScript(`document.querySelector('[data-act="clearBanner"]').click()`);await delay(300);
      await control.webContents.executeJavaScript(`document.querySelector('[data-bn="flawless"]').click()`);
      await waitFor(source,`HUD.state.banner.type==='flawless' && document.querySelector('.bn').classList.contains('on')`);
      check('reduced motion uses only opacity transitions',await source.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn');getComputedStyle(bn).opacity;return !bn.getAnimations({subtree:true}).some(animation=>animation.transitionProperty==='transform');})()`));
      await delay(350);
      fs.writeFileSync(path.join(output,'reduced-motion.png'),(await source.webContents.capturePage()).toPNG());
      await control.webContents.executeJavaScript(`document.querySelector('[data-act="clearBanner"]').click()`);await delay(350);
      check('clear leaves no hanging panel',await source.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.bn')).opacity==='0'`));
    } else if(process.argv.includes('--preview-only')) {
      for(const theme of reviewThemes.filter(value=>value!=='broadcast')) {
        const preview=await open('overlays/banners.html','preview=1&bannerTheme='+theme);
        await delay(850);
        await waitFor(preview,`Array.from(document.images).every(img=>!img.getAttribute('src') || img.complete)`,6000);
        const data=await preview.webContents.executeJavaScript(measure);
        check(theme+' emblem loads and content fits',data.on && data.emblem>0 && !data.failedImages.length && data.titleFits && data.footerFits);
        check(theme+' caption is centred',await preview.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.bn-kicker')).textAlign==='center'`));
        fs.writeFileSync(path.join(output,theme+'-flawless.png'),(await preview.webContents.capturePage()).toPNG());
        report.cases.push(data);
      }
    } else {
      await patch({layout:{bannerTheme:'broadcast'},banner:{type:'',ts:0},stinger:0,round:{phase:'live',endsAt:Date.now()+84000},killfeed:[],show:{economy:false,roundRecap:false,observed:false}});
      const control=await open('control.html','match=BANNERS&key='+key);
      const standalone=await open('overlays/banners.html'), ingame=await open('overlays/ingame.html');
      check('Broadcast and all three variants are available',await control.webContents.executeJavaScript(`Array.from(document.querySelector('[data-k="layout.bannerTheme"]').options).map(option=>option.value).join(',')==='broadcast,compact,monument,impact'`));
      check('Velocity is available in the control panel',await control.webContents.executeJavaScript(`document.querySelector('[data-k="layout.bannerTheme"] option[value="compact"]').textContent.includes('Velocity')`));
      for(const theme of reviewThemes) {
        await control.webContents.executeJavaScript(`(()=>{const selector=document.querySelector('[data-k="layout.bannerTheme"]');selector.value=${JSON.stringify(theme)};selector.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        check(theme+' selector reaches both sources',await waitFor(standalone,`HUD.state.layout.bannerTheme===${JSON.stringify(theme)}`) && await waitFor(ingame,`HUD.state.layout.bannerTheme===${JSON.stringify(theme)}`));
        check(theme+' sample link selects theme',await control.webContents.executeJavaScript(`document.querySelector('#bannerPreview').href.endsWith('bannerTheme=${theme}')`));
        for(const type of ['flawless','ace','teamace','clutch','thrifty','matchpoint','overtime','custom','round']) {
          if(type==='round')await control.webContents.executeJavaScript(`document.querySelector('[data-act="endRound"]').click()`);
          else await control.webContents.executeJavaScript(`document.querySelector('#bnT').value='0';document.querySelector('#bnN').value='3';document.querySelector('#bnX').value='THE FINAL PUSH';document.querySelector('#bnY').value='OVERTIME ON LOTUS';document.querySelector('[data-bn="${type}"]').click()`);
          if(!await waitFor(standalone,`HUD.state.banner.type==='${type}' && document.querySelector('.bn').classList.contains('on')`))report.violations.push(theme+' '+type+' never appeared');
          await delay(750);
          await standalone.webContents.executeJavaScript('document.fonts.ready');
          await waitFor(standalone,`Array.from(document.images).every(img=>!img.getAttribute('src') || img.complete)`,2000);
          const data=await standalone.webContents.executeJavaScript(measure);
          report.cases.push({theme,type,...data});
          if(!data.on || !data.title || data.failedImages.length)report.violations.push(theme+' '+type+' has missing content');
          if(theme!=='broadcast' && (data.theme!==theme || Math.abs(data.center-640)>1 || data.width!==1280 || !data.titleFits || !data.footerFits || !data.emblem))report.violations.push(theme+' '+type+' does not span the screen, fit, or have an icon');
          if(theme==='broadcast')check('original Broadcast '+type+' is preserved',await standalone.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn'),band=getComputedStyle(bn.querySelector('.band')),title=getComputedStyle(bn.querySelector('.t1')),crest=getComputedStyle(bn.querySelector('.bn-crest'));return band.height==='170px' && band.backgroundImage==='none' && title.top==='40px' && title.fontSize==='100px' && crest.display==='none' && getComputedStyle(bn.querySelector('.bn-watermark')).display==='none';})()`));
          else {
            check(theme+' '+type+' has centred icon and non-overlapping text',await standalone.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn'),icon=bn.querySelector('.bn-crest').getBoundingClientRect(),title=bn.querySelector('.t1').getBoundingClientRect(),footer=bn.querySelector('.bn-footer').getBoundingClientRect(),band=bn.querySelector('.band').getBoundingClientRect();return Math.abs(icon.x+icon.width/2-640)<1 && Math.abs(title.x+title.width/2-640)<1 && title.bottom<=footer.top+1 && Math.abs(band.width-1280)<1;})()`));
            check(theme+' '+type+' has no icon container or ring',await standalone.webContents.executeJavaScript(`(()=>{const crest=document.querySelector('.bn-crest'),style=getComputedStyle(crest),before=getComputedStyle(crest,'::before');return parseFloat(style.borderTopWidth)===0 && parseFloat(style.borderRadius)===0 && style.boxShadow==='none' && (before.content==='none' || before.content==='normal');})()`));
            check(theme+' '+type+' uses matching Valorant art',await standalone.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn'),images=Array.from(bn.querySelectorAll('.bn-agent img[src]')),personal=['ace','clutch'].includes(HUD.state.banner.type),neutral=['custom','overtime'].includes(HUD.state.banner.type);return images.length===(neutral?0:personal?1:5) && images.every(image=>image.naturalWidth>0) && bn.querySelectorAll('.bn-abilities img[src]').length===(personal && ['impact'].includes(${JSON.stringify(theme)})?4:0);})()`));
          }
          if(theme==='compact' && !await standalone.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn'),kicker=bn.querySelector('.bn-kicker');return bn.querySelectorAll('.bn-wing').length===2 && Array.from(bn.querySelectorAll('.bn-wing')).every(wing=>getComputedStyle(wing).display!=='none' && getComputedStyle(wing).opacity==='1') && getComputedStyle(bn.querySelector('.bn-watermark')).display!=='none' && kicker.textContent.length>0 && getComputedStyle(kicker).textAlign==='center';})()`))report.violations.push('Velocity elements missing or misaligned in live '+type);
          if(theme==='monument' && ['flawless','ace'].includes(type)) {
            const centre={x:400,y:195,width:480,height:190};
            const withArt=(await standalone.webContents.capturePage(centre)).toBitmap();
            await standalone.webContents.executeJavaScript(`document.querySelector('.bn-lineup').style.visibility='hidden';new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
            const withoutArt=(await standalone.webContents.capturePage(centre)).toBitmap();
            check('Monument '+type+' keeps portraits out of the central title area',withArt.equals(withoutArt));
            await standalone.webContents.executeJavaScript(`document.querySelector('.bn-lineup').style.visibility='';new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
            check('Monument '+type+' frame stays above artwork and below text',await standalone.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn'),frame=bn.querySelector('.bn-frame'),scene=bn.querySelector('.bn-scene'),title=bn.querySelector('.t1');return +getComputedStyle(frame).zIndex>+getComputedStyle(scene).zIndex && +getComputedStyle(frame).zIndex<+getComputedStyle(title).zIndex && frame.getBoundingClientRect().bottom>bn.querySelector('.bn-footer').getBoundingClientRect().bottom;})()`));
          }
          if(theme!=='broadcast' && ['custom','overtime','matchpoint'].includes(type)) {
            const readableLogo=await standalone.webContents.executeJavaScript(`(()=>{const crest=document.querySelector('.bn-crest'),icon=crest.querySelector('.bn-emblem'),style=getComputedStyle(icon),crestStyle=getComputedStyle(crest),band=document.querySelector('.bn .band'),a=icon.getBoundingClientRect(),b=band.getBoundingClientRect();return crest.classList.contains('brand-icon') && style.backgroundColor==='rgba(0, 0, 0, 0)' && parseFloat(style.paddingLeft)===0 && crestStyle.backgroundImage==='none' && crestStyle.backgroundColor==='rgba(0, 0, 0, 0)' && getComputedStyle(band).backgroundImage!=='none' && a.top>=b.top && a.bottom<=b.bottom;})()`);
            if(!readableLogo)report.violations.push(theme+' white brand emblem is boxed or outside the dark panel');
          }
          if(type==='custom') {
            await standalone.webContents.executeJavaScript(`window.reviewBackdrop=document.body.style.background;document.body.style.background='#fff';new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
            await delay(80);
          }
          fs.writeFileSync(path.join(output,theme+'-'+type+'.png'),(await standalone.webContents.capturePage()).toPNG());
          if(type==='custom')await standalone.webContents.executeJavaScript(`document.body.style.background=window.reviewBackdrop`);
          if(type==='flawless')fs.writeFileSync(path.join(output,theme+'-ingame.png'),(await ingame.webContents.capturePage()).toPNG());
        }
        for(const type of ['techpause','timeout']) {
          await control.webContents.executeJavaScript(`document.querySelector('[data-bn="${type}"]').click()`);
          await delay(550);
          const data=await standalone.webContents.executeJavaScript(measure);
          check(theme+' '+type+' appears',data.pause && data.pauseTheme===(theme!=='broadcast') && !data.on && await standalone.webContents.executeJavaScript(`(()=>{const pause=document.querySelector('.pause'),title=pause.querySelector('.a');return title.scrollWidth<=title.clientWidth+1 && ${JSON.stringify(theme!=='broadcast')}===pause.classList.contains(${JSON.stringify(theme)});})()`));
          if(theme!=='broadcast')check(theme+' '+type+' spans the screen',await standalone.webContents.executeJavaScript(`Math.abs(document.querySelector('.pause').getBoundingClientRect().width-1280)<1`));
          if(theme!=='broadcast')check(theme+' '+type+' has no icon ring',await standalone.webContents.executeJavaScript(`(()=>{const crest=document.querySelector('.pause-crest'),style=getComputedStyle(crest),before=getComputedStyle(crest,'::before');return parseFloat(style.borderTopWidth)===0 && parseFloat(style.borderRadius)===0 && (before.content==='none' || before.content==='normal');})()`));
          fs.writeFileSync(path.join(output,theme+'-'+type+'.png'),(await standalone.webContents.capturePage()).toPNG());
          await control.webContents.executeJavaScript(`document.querySelector('[data-act="clearBanner"]').click()`);
        }
      }
      // Unrecognised agents/maps must leave a usable banner and no stale art.
      const originalPlayers=await standalone.webContents.executeJavaScript('JSON.parse(JSON.stringify(HUD.state.players))');
      const unknownPlayers=originalPlayers.map(team=>team.map(player=>({...player,agent:'UNKNOWN_AGENT'})));
      for(const theme of themes.slice(1)) {
        await patch({layout:{bannerTheme:theme},players:unknownPlayers,map:{name:'UNKNOWN_MAP'},banner:{type:'ace',team:0,player:0,ts:Date.now(),hold:9000}});
        await waitFor(standalone,`HUD.state.layout.bannerTheme===${JSON.stringify(theme)} && HUD.state.players[0][0].agent==='UNKNOWN_AGENT'`);
        await delay(350);
        check(theme+' unknown assets retain a readable banner',await standalone.webContents.executeJavaScript(`(()=>{const bn=document.querySelector('.bn');return bn.classList.contains('on') && bn.querySelector('.t1').textContent==='ACE' && getComputedStyle(bn.querySelector('.t1')).opacity==='1' && bn.querySelectorAll('.bn-agent img[src],.bn-abilities img[src]').length===0;})()`));
      }
      await patch({players:originalPlayers,map:{name:'LOTUS'},banner:{type:'ace',team:0,player:0,ts:Date.now(),hold:9000}});
      await waitFor(standalone,`document.querySelector('.bn-agent img').getAttribute('src')`);
      check('unavailable decorative art hides cleanly',await standalone.webContents.executeJavaScript(`(()=>{const image=document.querySelector('.bn-agent img');image.dispatchEvent(new Event('error'));return !image.hasAttribute('src') && image.style.visibility==='hidden' && document.querySelector('.bn .t1').textContent==='ACE';})()`));
      await patch({layout:{bannerTheme:'contour'},banner:{type:'flawless',team:0,player:0,ts:Date.now(),hold:9000}});
      await waitFor(standalone,`HUD.state.layout.bannerTheme==='contour'`);
      await waitFor(control,`HUD.state.layout.bannerTheme==='contour'`);
      check('removed Contour falls back to Broadcast in overlay and control',await standalone.webContents.executeJavaScript(`HUD.bannerTheme('contour')==='broadcast' && !HUD.bannerThemes.includes('contour') && !document.querySelector('.bn').classList.contains('compact')`) && await control.webContents.executeJavaScript(`document.querySelector('[data-k="layout.bannerTheme"]').value==='broadcast' && !document.querySelector('option[value="contour"]') && document.querySelector('#bannerPreview').href.endsWith('bannerTheme=broadcast')`));
      // Switching the theme while a moment is on air must retain its original trigger.
      await control.webContents.executeJavaScript(`document.querySelector('[data-bn="flawless"]').click()`);
      await waitFor(standalone,`HUD.state.banner.type==='flawless'`);
      const ts=await standalone.webContents.executeJavaScript('HUD.state.banner.ts');
      await control.webContents.executeJavaScript(`(()=>{const selector=document.querySelector('[data-k="layout.bannerTheme"]');selector.value='broadcast';selector.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      check('switch active theme without retriggering',await waitFor(standalone,`!document.querySelector('.bn').classList.contains('compact') && HUD.state.banner.ts===${ts} && document.querySelector('.bn').classList.contains('on')`));
      for(const theme of themes.slice(1)) {
        await control.webContents.executeJavaScript(`(()=>{const selector=document.querySelector('[data-k="layout.bannerTheme"]');selector.value=${JSON.stringify(theme)};selector.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        check(theme+' switch retains the active trigger',await waitFor(standalone,`HUD.state.layout.bannerTheme===${JSON.stringify(theme)} && HUD.state.banner.ts===${ts} && document.querySelector('.bn').classList.contains('on')`));
      }
      await control.webContents.executeJavaScript(`document.querySelector('[data-act="clearBanner"]').click()`);
      check('clear removes the active graphic',await waitFor(standalone,`!document.querySelector('.bn').classList.contains('on') && !document.querySelector('.pause').classList.contains('on')`));
      await control.webContents.executeJavaScript(`(()=>{const selector=document.querySelector('[data-k="layout.bannerTheme"]');selector.value='compact';selector.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await waitFor(standalone,`HUD.state.layout.bannerTheme==='compact'`);
      await patch({banner:{type:'flawless',team:0,player:0,ts:Date.now(),hold:1200}});
      check('fresh capture-style event keeps selected theme',await waitFor(ingame,`HUD.state.banner.type==='flawless' && document.querySelector('.bn').classList.contains('compact') && document.querySelector('.bn').classList.contains('on')`));
      await delay(1850);
      check('compact expires cleanly',!await standalone.webContents.executeJavaScript(`document.querySelector('.bn').classList.contains('on')`));
      await standalone.loadURL(standalone.webContents.getURL());
      check('theme survives source reload',await waitFor(standalone,`window.HUD_READY && HUD.state.layout.bannerTheme==='compact' && document.querySelector('.bn').classList.contains('compact')`));
      for(const theme of themes) {
        await control.webContents.executeJavaScript(`(()=>{const selector=document.querySelector('[data-k="layout.bannerTheme"]');selector.value=${JSON.stringify(theme)};selector.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await waitFor(standalone,`HUD.state.layout.bannerTheme===${JSON.stringify(theme)}`);
        await standalone.loadURL(standalone.webContents.getURL());
        check(theme+' survives source reload',await waitFor(standalone,`window.HUD_READY && HUD.state.layout.bannerTheme===${JSON.stringify(theme)}`));
        const preview=await open('overlays/banners.html','preview=1&bannerTheme='+theme);
        await delay(850);
        check(theme+' preview is isolated',await preview.webContents.executeJavaScript(`HUD.preview && !HUD.live && !HUD.match && HUD.state.layout.bannerTheme===${JSON.stringify(theme)} && document.querySelector('.bn').classList.contains('compact')===${theme!=='broadcast'}`));
      }
    }
  } catch(error) {report.violations.push(error.message);}
  finally {windows.forEach(win=>win.destroy());server.stop();}
  fs.writeFileSync(path.join(output,process.argv.includes('--preview-only')?'visual-report.json':!motionOnly && themeArg?'report-'+motionTheme+'.json':'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:report.checks,cases:report.cases.length,errors,violations:report.violations},null,2));
  app.exit(report.violations.length || errors.length ? 1 : 0);
}).catch(error=>{console.error(error);app.exit(1);});
