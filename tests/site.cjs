// Geometry checks use real browser layout; screenshots still need visual review.
const playwright = require('playwright');
const fs = require('fs');
const { pathToFileURL } = require('url');
const path = require('path');
const assert = require('assert');
async function auditDesign(page) {
  return page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const style = s => getComputedStyle(document.querySelector(s));
    const p = r('.portrait'), copy = r('.hero-copy'), grid = r('.hero-grid');
    const photo = document.querySelector('.portrait');
    const ancestors = [];
    for(let el=photo.parentElement;el;el=el.parentElement) {
      const c=getComputedStyle(el);
      ancestors.push({tag:el.className||el.tagName,x:c.overflowX,y:c.overflowY});
    }
    const blocks = [...document.querySelectorAll('main section:not(.contact),.stats,.footer-row')].map(el => {
      const c=getComputedStyle(el), b=el.getBoundingClientRect();
      return {name:el.id||el.className||el.tagName,top:parseFloat(c.paddingTop),bottom:parseFloat(c.paddingBottom),left:b.left,right:document.documentElement.clientWidth-b.right,background:c.backgroundColor};
    });
    const families=[...document.querySelectorAll('h1,h2,h3,button,.intro,.contact-links a')].map(el=>getComputedStyle(el).fontFamily);
    const bottomGap=r('.contact-grid').top-r('#thumbs').bottom;
    return {blocks,families,bottomGap,body:style('body').backgroundColor,
      photo:{loaded:photo.complete&&photo.naturalWidth>0,width:p.width,height:p.height,natural:photo.naturalWidth,ratio:photo.naturalWidth/photo.naturalHeight,mask:style('.portrait').maskImage,blend:style('.portrait').mixBlendMode,ancestors},
      hero:{left:grid.left,right:document.documentElement.clientWidth-grid.right,gap:p.left-copy.right},
      contactsOneRow:Math.abs(r('.contact-links a:first-child').top-r('.contact-links a:last-child').top)<1,
      reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
      reveals:[...document.querySelectorAll('.scroll-reveal')].map(el=>getComputedStyle(el).opacity),
      footerReveal:document.querySelectorAll('.contact .scroll-reveal,footer .scroll-reveal,.contact.scroll-reveal,footer.scroll-reveal').length,
      textOverflow:[...document.querySelectorAll('h1,h2,h3,p,.stat span,.contact-links a')].filter(el=>el.clientWidth>0 && el.scrollWidth>el.clientWidth+1).map(el=>el.textContent.trim()),
      fontLoaded:document.fonts.check('16px Manrope')};
  });
}
function assertDesign(d,width) {
  assert(d.fontLoaded,'Self-hosted font not loaded');
  assert.equal(d.textOverflow.length,0,`Text overflowing its container: ${d.textOverflow}`);
  assert(new Set(d.families).size===1,'Font family drift');
  assert.equal(d.body,'rgb(23, 25, 26)','Graphite background changed');
  for(const b of d.blocks) {
    assert(Math.abs(b.top-b.bottom)<1,`${b.name}: unequal vertical padding`);
    assert(Math.abs(b.left-b.right)<1,`${b.name}: unequal outer gutters`);
    assert(['rgba(0, 0, 0, 0)',d.body].includes(b.background),`${b.name}: isolated background`);
  }
  assert(d.bottomGap>=24 && d.bottomGap<=33,`Gallery to footer gap: ${d.bottomGap}`);
  assert(d.contactsOneRow,'Email and phone wrap onto separate rows');
  assert.equal(d.footerReveal,0,'Contact/footer reveal reintroduced');
  assert(d.photo.loaded && d.photo.width>0 && d.photo.width<=360.5,'Portrait dimensions');
  assert(Math.abs(d.photo.width/d.photo.height-d.photo.ratio)<.002,'Portrait stretched or cropped');
  assert(d.photo.natural>=d.photo.width*2,'Insufficient portrait pixels at 2× density');
  assert.equal(d.photo.blend,'normal','Portrait blend alters original face');
  assert(d.photo.mask.includes('gradient'),'Missing portrait fade');
  assert(d.photo.ancestors.every(a=>!['hidden','clip'].includes(a.x)&&!['hidden','clip'].includes(a.y)),'Glow clipped by ancestor');
  assert(Math.abs(d.hero.left-d.hero.right)<1,'Hero off center');
  if(width>=761) assert(d.hero.gap>=23 && d.hero.gap<=25,'Hero text/photo separation');
  if(d.reducedMotion) assert(d.reveals.every(o=>Number(o)===1),'Hidden content with reduced motion');
}

async function extraBehavior(page,engine,browser) {
  // Inspect real animation duration and thumbnail motion at several times.
  await page.locator('.tab').first().click();
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  // Clicking an offscreen thumbnail would scroll it into view before the click.
  // Arrow clicks exercise the site's own scrolling, not Playwright's helper.
  const scrollable=await page.locator('#thumbs').evaluate(el=>el.scrollWidth>el.clientWidth);
  for(let i=0;i<slideCount-1;i++)await page.locator('#next').click();
  const durations=await page.locator('#slide').evaluate(el=>el.getAnimations().map(a=>a.effect.getTiming().duration));
  assert(durations.includes(1000),'Slide duration is not one second');
  const scroll=()=>page.locator('#thumbs').evaluate(el=>el.scrollLeft);
  const start=await scroll(); await page.clock.runFor(500); const middle=await scroll();
  await page.clock.runFor(650); const end=await scroll();
  if(scrollable)assert(middle>start && end>middle,`Thumbnail transition positions: ${start}, ${middle}, ${end}`);
  await page.clock.runFor(200); assert.equal(await scroll(),end,'Thumbnail transition overran slide');
  await page.locator('#open').click();
  for(let i=0;i<7;i++) {
    await page.keyboard.press('Tab');
    // Native dialogs allow traversal to browser chrome (activeElement=body),
    // but must never focus an interactive element on the underlying page.
    assert(await page.evaluate(()=>document.activeElement===document.body||document.activeElement.closest('#viewer')!==null),'Focus escaped to page behind dialog');
  }
  // Let the native close event run before pausing time. It is a browser task,
  // not a JS timeout controlled by Playwright's clock.
  await page.evaluate(()=>document.querySelector('#viewer').addEventListener('close',()=>{window.qaClosedAt=Date.now();},{once:true}));
  await page.clock.resume();
  await page.bringToFront();
  await page.locator('#close').focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.qaClosedAt!==undefined);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+10));
  assert(!(await page.locator('#viewer').evaluate(el=>el.open)),'Escape did not close focused dialog');
  const saved=await page.locator('#count').textContent();
  const remaining=await page.evaluate(()=>5000-(Date.now()-window.qaClosedAt));
  assert(remaining>50,'Test setup consumed the autoplay interval');
  await page.clock.runFor(remaining-50); assert.equal(await page.locator('#count').textContent(),saved,'Timer resumed too early after modal close');
  await page.clock.runFor(100); assert.notEqual(await page.locator('#count').textContent(),saved,'Timer did not resume after close');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#next').click();
  assert.equal(await page.locator('#slide').evaluate(el=>el.getAnimations().length),0,'Reduced-motion slide still animated');
  // Resize an already-open viewer, not only pages opened at a fixed size.
  await page.locator('#open').click(); await page.setViewportSize({width:390,height:844});
  assert(await page.locator('.modal-controls').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1),'Viewer broken after resize');
  await page.keyboard.press('Escape'); await page.clock.resume(); await page.close();

  // HTTPS + a Pages subpath, with no production server dependency.
  // Routing exercises URLs and fallback, not the browser's HTTP cache itself.
  for(const failJson of [false,true]) {
    const http=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
    const errors=[]; http.on('pageerror',e=>errors.push(e.message));
    const requests=[];
    await http.route('https://portfolio.test/**',async route=>{
      const url=new URL(route.request().url()); requests.push(url.pathname+url.search);
      if(failJson && url.pathname.endsWith('/portfolio.json'))return route.abort();
      const relative=decodeURIComponent(url.pathname).replace(/^\/preview\//,'')||'index.html';
      const file=path.resolve(site,relative);
      if(!file.startsWith(site+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing'});
      await route.fulfill({path:file});
    });
    await http.goto('https://portfolio.test/preview/index.html');
    await http.waitForFunction(n=>document.querySelectorAll('.thumb').length===n,slideCount);
    await http.locator('#slide').evaluate(img=>img.decode());
    const href=await http.locator('.download-pdf').getAttribute('href');
    assert.equal(href,manifest.pdf,'App discarded versioned PDF link');
    const resource=await http.evaluate(async url=>{const response=await fetch(url);return {ok:response.ok,signature:(await response.text()).slice(0,5)};},href);
    assert(resource.ok&&resource.signature==='%PDF-','PDF download failed');
    assert(requests.some(url=>url.includes('/preview/portfolio.json')),'HTTP manifest not requested');
    assert.equal(errors.length,0,errors.join('\n'));
    await http.close();
  }
  if(engine==='chromium') {
    const touch=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await touch.goto(pathToFileURL(path.join(site,'index.html')).href);
    await touch.waitForFunction(n=>document.querySelectorAll('.thumb').length===n,slideCount);
    await touch.locator('#stage').scrollIntoViewIfNeeded();
    const b=await touch.locator('#open').boundingBox();
    const count=await touch.locator('#count').textContent();
    const session=await touch.context().newCDPSession(touch);
    const x=b.x+b.width*.85,y=b.y+b.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*15,y}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notEqual(await touch.locator('#count').textContent(),count,'Synthesized touch swipe did not change slide');
    await touch.close();
  }
}
const root = path.resolve(__dirname,'..');
const site = path.resolve(root,process.env.SITE_ROOT || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(site,'portfolio.json'),'utf8'));
const slideCount = manifest.projects.reduce((n,p)=>n+p.slides.length,0);
const engines = (process.env.QA_BROWSERS || 'chromium,webkit').split(',');
const reportRoot = path.join(root,'output/qa');
fs.mkdirSync(reportRoot,{recursive:true});
(async()=>{
  for (const engine of engines) {
  const out = path.join(reportRoot,engine); fs.mkdirSync(out,{recursive:true});
  fs.rmSync(path.join(out,'failure.json'),{force:true});
  fs.rmSync(path.join(out,'report.json'),{force:true});
  const browser = await playwright[engine].launch({headless:true,...(engine==='chromium' && process.env.QA_CHROME ? {executablePath:process.env.QA_CHROME} : {})});
  const results=[];
  try {
  for (const [width,height] of (process.env.QA_PHASE==='behavior'?[]:[[1920,1080],[1440,900],[1366,768],[1280,800],[1101,800],[1100,800],[1024,768],[768,1024],[761,900],[760,900],[601,900],[600,900],[430,932],[390,844],[360,800],[320,740],[844,390]])) {
    const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce',hasTouch:width<=600,isMobile:width<=600,deviceScaleFactor:width<=600?2:1});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(site,'index.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(n=>document.querySelectorAll('.thumb').length===n,slideCount);
    await page.locator('#slide').evaluate(img=>img.decode());
    await page.evaluate(()=>clearTimeout(autoTimer));
    await page.screenshot({path:path.join(out,`${width}-hero.png`)});
    for (const y of [800,1600,2400,3600]) {await page.evaluate(y=>window.scrollTo(0,y),y);await page.waitForTimeout(100);}
    await page.evaluate(()=>window.scrollTo(0,0));
    const measures=await page.evaluate(()=>{
      const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      const offenders=[...document.querySelectorAll('body *')].filter(el=>!el.closest('dialog,.thumbs,.mallpic-crop,.tabs')&&getComputedStyle(el).display!=='none').filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<-.5||r.right>document.documentElement.clientWidth+.5)}).map(el=>el.tagName+'.'+el.className).slice(0,12);
      return {scrollWidth:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,offenders,hero:rect('.hero-grid'),copy:rect('.hero-copy'),portrait:rect('.portrait-wrap'),headings:[...document.querySelectorAll('h2')].map(el=>({text:el.textContent,color:getComputedStyle(el).color,size:getComputedStyle(el).fontSize})),logos:[...document.querySelectorAll('.event-logos img')].map(el=>({alt:el.alt,loaded:el.complete&&el.naturalWidth>0})),sections:[...document.querySelectorAll('main section')].map(el=>({id:el.id,padding:getComputedStyle(el).padding,background:getComputedStyle(el).backgroundColor}))};
    });
    const layout=await page.evaluate(()=>{
      const r=s=>document.querySelector(s).getBoundingClientRect(),a=r('.contact-grid'),b=r('.contact-note'),h=r('.contact h2'),l=r('.contact-links'),btn=r('#next');
      return {button:[btn.width,btn.height],contactGaps:[b.top-a.top-1,h.top-b.bottom,l.top-h.bottom,a.bottom-l.bottom],sides:[b.left-a.left,a.right-r('.contact-note-end').right],scrollbar:getComputedStyle(document.querySelector('.thumbs')).scrollbarWidth};
    });
    assert(Math.abs(layout.button[0]-layout.button[1])<1,'Arrow not circular');
    if(width<=760)assert(Math.max(...layout.contactGaps)-Math.min(...layout.contactGaps)<2,`Contact gaps ${width}: ${layout.contactGaps}`);
    else assert(Math.abs(layout.sides[0]-layout.sides[1])<1,'Contact notes not symmetric');
    assert.equal(layout.scrollbar,'none');
    measures.layout=layout;
    measures.design = await auditDesign(page);
    assertDesign(measures.design,width);
    if(results.length===0) {
      // Negative controls prove these checks catch past regressions.
      for(const css of ['.hero-grid{overflow:hidden!important}', '#about{padding-bottom:1px!important}', 'body{background:red!important}']) {
        const fault=await page.addStyleTag({content:css});
        const broken=await auditDesign(page);
        assert.throws(()=>assertDesign(broken,width),`Missed injected regression: ${css}`);
        await fault.evaluate(el=>el.remove());
      }
    }
    assert.equal(measures.scrollWidth,measures.width,`${width}: page overflow`);
    assert.equal(measures.offenders.length,0,`${width}: ${measures.offenders}`);
    assert(measures.logos.every(l=>l.loaded),`${width}: broken logo`);
    assert(measures.headings.every(h=>h.color==='rgb(240, 242, 232)'),`${width}: heading color`);
    assert.equal(errors.length,0,errors.join('\n'));
    await page.screenshot({path:path.join(out,`${width}-full.png`),fullPage:true});
    await page.locator('.events').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`${width}-events.png`)});
    await page.evaluate(()=>{location.hash='portfolio';document.querySelector('#portfolio').scrollIntoView();fitGallery();});
    await page.waitForTimeout(100);
    measures.gallery=await page.evaluate(()=>({top:document.querySelector('#portfolio').getBoundingClientRect().top,tabsTop:document.querySelector('#tabs').getBoundingClientRect().top,bottom:document.querySelector('#thumbs').getBoundingClientRect().bottom,viewport:innerHeight,slideHeight:document.querySelector('#open').clientHeight}));
    await page.screenshot({path:path.join(out,`${width}-portfolio.png`)});
    if(height>=740)assert(measures.gallery.bottom<=height+2,`${width}: gallery ${JSON.stringify(measures.gallery)}`);
    await page.locator('#open').click();
    const viewerLayout=await page.evaluate(()=>{
      const r=s=>document.querySelector(s).getBoundingClientRect();
      const left=r('#modal-prev'),right=r('#modal-next'),count=r('#modal-count'),row=r('.modal-controls'),photo=r('#modal-image');
      const range=document.createRange();range.selectNodeContents(document.querySelector('#modal-count'));const text=range.getBoundingClientRect();
      return {textOffset:text.left+text.width/2-innerWidth/2,arrowOffset:(left.left+left.width/2+right.left+right.width/2)/2-innerWidth/2,verticalOffset:count.top+count.height/2-row.top-row.height/2,photoBounds:photo.top>=0&&photo.bottom<=innerHeight,rowBottom:row.bottom,viewport:innerHeight};
    });
    assert(Math.abs(viewerLayout.textOffset)<1,`${width}: modal text off center`);
    assert(Math.abs(viewerLayout.arrowOffset)<1,`${width}: modal arrows off center`);
    assert(Math.abs(viewerLayout.verticalOffset)<1,`${width}: modal row off center`);
    assert(viewerLayout.photoBounds&&viewerLayout.rowBottom<=height+1,`${width}: modal overflow`);
    await page.screenshot({path:path.join(out,`${width}-modal.png`)});
    await page.keyboard.press('Escape');measures.viewer=viewerLayout;
    if(width>1100){
      const guides=await page.evaluate(()=>[2,3].map(n=>{
        const left=s=>document.querySelector(s).getBoundingClientRect().left;
        return [left(`.stat:nth-child(${n})`),left(n===2?'.experience':'.education'),left(`.skill:nth-child(${n})`)];
      }));
      assert(guides.every(a=>Math.max(...a)-Math.min(...a)<1),`${width}: column guides differ`);
    }
    results.push({width,height,errors,...measures});await page.close();
  }
  if(process.env.QA_PHASE!=='layout' && slideCount>1) {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.clock.install();
  await page.goto(pathToFileURL(path.join(site,'index.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(n=>document.querySelectorAll('.thumb').length===n,slideCount);
    await page.locator('#slide').evaluate(img=>img.decode());
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  const count=()=>page.locator('#count').textContent();
  const first=await count();await page.clock.runFor(5100);assert.notEqual(await count(),first,'Autoplay did not advance');
  await page.locator('#next').click();const manual=await count();await page.clock.runFor(4900);assert.equal(await count(),manual,'Manual timer did not reset');await page.clock.runFor(200);assert.notEqual(await count(),manual,'Autoplay did not resume');
  await page.clock.resume();
  for(let i=0;i<12;i++){await page.locator('#next').click();await page.waitForTimeout(60);}
  await page.waitForTimeout(1700);
  assert(await page.evaluate(()=>{const a=document.querySelector('.thumb[aria-current=true]').getBoundingClientRect(),b=document.querySelector('#thumbs').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1}),'Active thumb not visible');
  await page.locator('.tab').nth(1).click();assert.equal(await page.locator('#project-title').textContent(),manifest.projects[0].title);assert((await count()).startsWith('01'));
  await page.locator('#open').click();assert(await page.locator('#viewer').evaluate(el=>el.open));
  await page.screenshot({path:path.join(out,'modal-desktop.png')});
  assert(await page.locator('#modal-image').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>200}),'Modal image bounds');
  const modal=await page.locator('#modal-count').textContent();await page.clock.runFor(6100);assert.equal(await page.locator('#modal-count').textContent(),modal,'Modal autoplay not paused');await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#modal-count').textContent(),modal);
  await page.keyboard.press('Escape');assert(!(await page.locator('#viewer').evaluate(el=>el.open)));assert(await page.locator('#open').evaluate(el=>el===document.activeElement));
  assert.equal(await page.locator('a[href="https://t.me/aviita"]').count(),0);
  assert.equal(await page.locator('.autoplay').count(),0);
  await extraBehavior(page,engine,browser);
  results.push({functional:'PASS: autoplay 5s, manual reset, thumbnail following, project tabs, modal, keyboard, focus restoration, user contact edits, no pause button'});
  }
  results.push({metadata:{date:new Date().toISOString(),site:path.relative(root,site)||'.',engine,version:browser.version(),slides:slideCount,phase:process.env.QA_PHASE||'all'}});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
  console.log(`${engine}: PASS — ${results.filter(r=>r.width).length} viewports; phase: ${process.env.QA_PHASE||'all'}`);
  } catch(error) {
    fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,completed:results},null,2));
    throw error;
  } finally { await browser.close(); }
  }
})().catch(error=>{console.error(error);process.exit(1)});
