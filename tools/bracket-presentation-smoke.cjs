// Real HUD renderer with synthetic published/manual data. No accounts or OBS.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {start}=require('../esportra-valorant-hud/server/server');
const {chromium}=require('../../frag-and-book-main/node_modules/playwright');
async function main(){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'air-bracket-render-'));
  const server=await start({port:0,key:'synthetic-bracket-key',root:path.resolve(__dirname,'../esportra-valorant-hud'),dataDir:temporary});
  let browser;
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/,route=>route.abort());
    await page.goto(`http://127.0.0.1:${server.port}/overlays/bracket.html?match=BRACKET_TEST`);
    await page.getByText('Bracket not selected',{exact:true}).waitFor();assert.equal(await page.getByText('PAPER REX',{exact:true}).count(),0);
    const target=path.resolve(__dirname,'../design/implemented'),manifestPath=path.join(target,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath)),records=[];
    const stageId='06100000-0000-4000-8000-000000000601';
    const stage={id:stageId,label:'Invitational playoffs',format:'double_elimination',matches:[],standings:[]},matches=[];
    for(const side of ['upper','lower','final','group'])for(let round=0;round<(side==='upper'?3:1);round++)for(let n=0;n<(side==='final'?1:side==='upper'?16/2**round:16);n++){
      const id=`${side}-${round}-${n}`,next=side==='upper'&&round<2?`${side}-${round+1}-${Math.floor(n/2)}`:null;
      stage.matches.push({id,matchId:id,round,side,nextMatchId:next});matches.push({matchId:id,status:'completed',scores:[2,1],winnerId:id+'-a',teams:[{id:id+'-a',name:`North ${round+1}.${n+1}`},{id:id+'-b',name:`South ${round+1}.${n+1}`}]});
    }
    stage.standings=Array.from({length:16},(_,n)=>({rank:n+1,teamName:`Team ${n+1}`,wins:5,losses:n%3,points:15-n}));
    const variants=[['V40-bracket-upper','Upper elimination bracket','upper','matches',0],['V41-bracket-lower','Lower elimination bracket','lower','matches',0],['V42-bracket-final','Final bracket','final','matches',0],['V43-group-matches','Group match presentation','group','matches',0],['V44-swiss-standings','Source Swiss standings','group','standings',0],['V45-bracket-pagination','Large bracket second page','upper','matches',1]];
    for(const [id,title,side,mode,pageIndex] of variants){
      const data={stages:[stage],matches,view:{stageId,side,mode,page:pageIndex,startRound:0}};
      const response=await fetch(`http://127.0.0.1:${server.port}/api/BRACKET_TEST`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Esportra-Key':'synthetic-bracket-key'},body:JSON.stringify({event:{name:'SYNTHETIC BROADCAST FIXTURE'},broadcastBracket:data})});assert.equal(response.ok,true);
      await page.waitForFunction(expected=>window.HUD?.state.broadcastBracket?.view.side===expected.side&&window.HUD.state.broadcastBracket.view.mode===expected.mode&&window.HUD.state.broadcastBracket.view.page===expected.page,{side,mode,page:pageIndex});
      await page.waitForTimeout(50);await page.getByRole('heading',{name:stage.label}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      const overflow=await page.locator('#hud').evaluate(root=>[...root.querySelectorAll('strong')].some(element=>{const box=element.getBoundingClientRect();return box.right>innerWidth+1||box.bottom>innerHeight+1;}));assert.equal(overflow,false,id+' typography must fit the output');
      const overlaps=await page.locator('[data-bracket-match]').evaluateAll(cards=>cards.some((card,index)=>{const a=card.getBoundingClientRect();return cards.slice(index+1).some(other=>{const b=other.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});}));assert.equal(overlaps,false,id+' match cards must not overlap');
      if(mode==='standings')await page.getByText('Team 1',{exact:true}).waitFor();else await page.getByText(pageIndex?'North 1.9':'North 1.1',{exact:true}).waitFor();
      if(side==='upper') { await page.getByText(pageIndex?'North 2.5':'North 2.1',{exact:true}).waitFor();await page.getByText(pageIndex?'North 3.3':'North 3.1',{exact:true}).waitFor();assert.equal(await page.locator('[data-bracket-match]').count(),14); }
      const file=`screens/V/${id}.png`;fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});await page.screenshot({path:path.join(target,file)});
      records.push({id,group:'V',title,component:'HUD bracket-presentation.js',route:'/overlays/bracket.html?match=BRACKET_TEST',surface:'desktop renderer',file,viewport:{width:1280,height:720},notes:'Real HUD rendering with explicitly synthetic supplied results; no live tournament acceptance.',verification:'real HUD / synthetic data',liveServices:false,horizontalOverflow:false});
    }
    assert.deepEqual(errors,[]);const replaced=new Set(records.map(row=>row.id));manifest.records=[...manifest.records.filter(row=>!replaced.has(row.id)),...records];manifest.screenshots=manifest.records.length;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
    console.log(JSON.stringify({presentations:variants.length,missingData:'empty without sample results',rendererErrors:errors,overflow:false,referenceScreens:manifest.records.length,liveServices:false}));
  }finally{await browser?.close();server.stop();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(path.dirname(temporary),os.tmpdir());assert.ok(path.basename(temporary).startsWith('air-bracket-render-'));fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
