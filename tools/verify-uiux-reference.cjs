const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('../../frag-and-book-main/node_modules/playwright');
const { JSDOM } = require('../../frag-and-book-main/node_modules/jsdom');
const root=path.resolve(__dirname,'..');
const target=path.join(root,'design/implemented');
async function main(){
  const manifest=JSON.parse(fs.readFileSync(path.join(target,'manifest.json')));
  const document=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8')).window.document;
  const originalImages=[...document.querySelectorAll('img[src^="screens/"]')].map(x=>x.getAttribute('src'));
  for(const image of originalImages)assert.ok(fs.existsSync(path.join(root,image)),image);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('file:///'+path.join(target,'index.html').replace(/\\/g,'/'));
    assert.equal(await page.locator('article:not([hidden])').count(),manifest.records.length);
    for(const group of manifest.groups){await page.getByLabel('Journey',{exact:true}).selectOption(group);assert.ok(await page.locator('article:not([hidden])').count()>0,group);}
    await page.getByLabel('Journey',{exact:true}).selectOption('all');
    await page.getByLabel('Search screens',{exact:true}).fill('correction');
    assert.equal(await page.locator('article:not([hidden])').count(),3);
    await page.getByLabel('Search screens',{exact:true}).fill('');
    await page.getByLabel('Surface',{exact:true}).selectOption('phone web');
    assert.equal(await page.locator('article:not([hidden])').count(),manifest.records.filter(record=>record.surface==='phone web').length);
    await page.getByLabel('Surface',{exact:true}).selectOption('all');
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    const report={date:manifest.date,screens:manifest.records.length,groups:26,originalImagesPreserved:new Set(originalImages).size,originalImageReferences:originalImages.length,galleryErrors:errors,searchAndFilters:'passed',phoneGalleryOverflow:false,liveServices:false};
    fs.writeFileSync(path.join(target,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
