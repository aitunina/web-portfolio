// Gallery, local folder loading, and section motion. No build step required.
const projects=[];
let project=0,current=0;
const $=id=>document.getElementById(id);
const viewer=$('viewer');
let motionDirection=1, autoTimer;
function resetAuto(){
  clearTimeout(autoTimer);
  if(!document.hidden&&!viewer.open&&projects[project]?.slides.length>1)autoTimer=setTimeout(()=>step(1),5000)
}
const slideDuration=1000;
let thumbFrame;
function revealThumb(){
  cancelAnimationFrame(thumbFrame);
  const strip=$('thumbs'),active=strip.children[current];
  if(!active)return;
  const start=strip.scrollLeft;
  const target=Math.min(strip.scrollWidth-strip.clientWidth,Math.max(0,active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2));
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){strip.scrollLeft=target;return}
  const began=performance.now();
  function tick(now){
    const t=Math.min(1,(now-began)/slideDuration),ease=t*t*(3-2*t);
    strip.scrollLeft=start+(target-start)*ease;
    if(t<1)thumbFrame=requestAnimationFrame(tick);
  }
  thumbFrame=requestAnimationFrame(tick);
}
function fitGallery(){
  const section=$('portfolio'),style=getComputedStyle(section);
  const title=section.querySelector('.section-title'),tabs=$('tabs'),footer=section.querySelector('.gallery-footer'),thumbs=$('thumbs');
  const outer=el=>{
    const c=getComputedStyle(el);
    return el.getBoundingClientRect().height+parseFloat(c.marginTop)+parseFloat(c.marginBottom)
  }
  ;
  const available=window.innerHeight-document.querySelector('header').getBoundingClientRect().height-16-parseFloat(style.paddingTop)-outer(title)-outer(tabs)-outer(footer)-outer(thumbs)-24;
  const stageStyle=getComputedStyle($('stage'));
  const sideSpace=2*(parseFloat(stageStyle.columnGap)+$('prev').getBoundingClientRect().width);
  const natural=(section.clientWidth-sideSpace)*9/16;
  const height=Math.min(natural,Math.max(150,available));
  $('open').style.height=height+'px';
  section.style.setProperty('--gallery-width',(height*16/9+sideSpace)+'px')
}
window.addEventListener('resize',fitGallery);
window.addEventListener('load',fitGallery);
document.fonts.ready.then(fitGallery);
document.addEventListener('visibilitychange',resetAuto);
function swapImage(img,src){
  if(img.getAttribute('src')===src)return;
  const old=img.getAttribute('src');
  img.getAnimations().forEach(a=>a.cancel());
  if(old&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    if(img.id==='slide'){
      img.parentNode.querySelectorAll('.slide-ghost').forEach(x=>x.remove());
      const ghost=img.cloneNode();
      ghost.removeAttribute('id');
      ghost.alt='';
      ghost.setAttribute('aria-hidden','true');
      ghost.className='slide-ghost';
      img.parentNode.append(ghost);
      const a=ghost.animate([{
        opacity:1,transform:'translateX(0)'
      }
      ,{
        opacity:0,transform:`translateX(${-motionDirection*14}px)`
      }
      ],{
        duration:slideDuration,easing:'cubic-bezier(.42,0,.58,1)'
      }
      );
      a.onfinish=()=>ghost.remove()
    }
    img.animate([{
      opacity:0,transform:`translateX(${motionDirection*14}px)`
    }
    ,{
      opacity:1,transform:'translateX(0)'
    }
    ],{
      duration:slideDuration,easing:'cubic-bezier(.42,0,.58,1)'
    }
    )
  }
  img.src=src
}
function render(){
  const p=projects[project];
  if(!p||!p.slides.length)return;
  swapImage($('slide'),p.slides[current]);
  $('slide').alt=p.title+' — слайд '+(current+1);
  $('project-title').textContent=p.title;
  $('project-kind').textContent=p.kind;
  $('count').textContent=String(current+1).padStart(2,'0')+' / '+String(p.slides.length).padStart(2,'0');
  document.querySelectorAll('.tab').forEach((b,i)=>b.setAttribute('aria-pressed',i===project));
  const oldScroll=$('thumbs').scrollLeft;
  $('thumbs').replaceChildren(...p.slides.map((src,i)=>{
    const b=document.createElement('button');
    b.className='thumb';
    b.setAttribute('aria-label',p.title+', слайд '+(i+1));
    b.setAttribute('aria-current',i===current);
    const im=new Image();
    im.src=src;
    im.alt='';
    im.loading='lazy';
    b.append(im);
    b.onclick=()=>{
      motionDirection=i>=current?1:-1;
      current=i;
      render();
      $('thumbs').children[i].focus({
        preventScroll:true
      }
      )
    }
    ;
    return b
  }
  ));
  $('thumbs').scrollLeft=oldScroll;
  requestAnimationFrame(()=>{
    revealThumb();
    fitGallery()
  }
  );
  resetAuto();
  if(viewer.open)syncModal()
}
function syncModal(){
  swapImage($('modal-image'),projects[project].slides[current]);
  $('modal-image').alt=$('slide').alt;
  $('modal-title').textContent=projects[project].title;
  $('modal-count').textContent=$('count').textContent
}
function step(n){
  if(!projects[project]?.slides.length)return;
  motionDirection=n;
  current=(current+n+projects[project].slides.length)%projects[project].slides.length;
  render()
}
function buildTabs(){
  $('tabs').replaceChildren();
  projects.forEach((p,i)=>{
    const b=document.createElement('button');
    b.className='tab';
    b.textContent=p.title;
    b.onclick=()=>{
      project=i;
      current=0;
      render()
    }
    ;
    $('tabs').append(b)
  }
  );
}
$('prev').onclick=()=>step(-1);
$('next').onclick=()=>step(1);
$('modal-prev').onclick=()=>step(-1);
$('modal-next').onclick=()=>step(1);
$('open').onclick=()=>{
  viewer.showModal();
  clearTimeout(autoTimer);
  document.body.classList.add('modal-open');
  syncModal();
  $('close').focus()
}
;
$('close').onclick=()=>viewer.close();
viewer.addEventListener('close',()=>{
  document.body.classList.remove('modal-open');
  resetAuto();
  $('open').focus()
}
);
document.addEventListener('keydown',e=>{
  if(viewer.open||$('portfolio').contains(document.activeElement)){
    if(e.key==='ArrowLeft'){
      e.preventDefault();
      step(-1)
    }
    if(e.key==='ArrowRight'){
      e.preventDefault();
      step(1)
    }
  }
}
);
let startX=0,startY=0;
[$('stage'),$('modal-image')].forEach(el=>{
  el.addEventListener('touchstart',e=>{
    startX=e.changedTouches[0].clientX;
    startY=e.changedTouches[0].clientY
  }
  ,{
    passive:true
  }
  );
  el.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4)step(dx<0?1:-1)
  }
  ,{
    passive:true
  }
  )
}
);
buildTabs();
render();
function plural(n,forms){
  return forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]
}
function showGalleryError(message){
  $('tabs').textContent=message;
  ['stage','thumbs'].forEach(id=>$(id).hidden=true);
  document.querySelector('.gallery-footer').hidden=true;
  document.querySelector('.download-pdf').hidden=true
}
async function loadFolders(){
  try{
    let data=window.PORTFOLIO_DATA;
    if(location.protocol!=='file:'){
      try{
        const response=await fetch($('app-script').dataset.portfolioSrc,{cache:'no-cache'});
        if(response.ok)data=await response.json();
      }catch(error){ /* Generated JS also works offline and with file://. */ }
    }
    if(!Array.isArray(data?.projects))throw new Error('Missing generated portfolio data');
    const list=data.projects;
    projects.splice(0,projects.length,{
      title:'Все работы',kind:'',slides:list.flatMap(p=>p.slides)
    }
    ,...list);
    project=0;
    current=0;
    buildTabs();
    const total=projects[0].slides.length;
    $('portfolio-summary').textContent=list.length+' '+plural(list.length,['раздел','раздела','разделов'])+' / '+total+' '+plural(total,['слайд','слайда','слайдов']);
    const hasSlides=total>0;
    ['stage','thumbs'].forEach(id=>$(id).hidden=!hasSlides);
    document.querySelector('.gallery-footer').hidden=!hasSlides;
    const pdf=document.querySelector('.download-pdf');
    pdf.hidden=!hasSlides;
    pdf.href=data.pdf||'downloads/portfolio.pdf';
    pdf.querySelector('span').textContent='PDF ↓';
    if(hasSlides)render();
    else{
      $('project-title').textContent='';
      $('tabs').textContent='Портфолио скоро появится';
    }
  }
  catch(e){
    showGalleryError('Не удалось загрузить портфолио. Запустите сборку портфолио и обновите страницу.')
  }
}
loadFolders();
// Reveal content once, without hiding it when JavaScript or motion is unavailable.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
if(!reducedMotion.matches&&'IntersectionObserver' in window){
  const revealObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target)
      }
    }
  }
  ,{
    threshold:0,rootMargin:'0px 0px -48px 0px'
  }
  );
  document.querySelectorAll('.about-layout,.skills,.events,#portfolio>.section-title,#portfolio>.tabs,#portfolio>.stage,#portfolio>.gallery-footer,#portfolio>.thumbs').forEach(el=>{
    if(el.getBoundingClientRect().top>innerHeight-48){
      el.classList.add('scroll-reveal');
      revealObserver.observe(el)
    }
  }
  );
  document.addEventListener('focusin',event=>event.target.closest('.scroll-reveal')?.classList.add('is-visible'));
  reducedMotion.addEventListener('change',()=>{
    if(reducedMotion.matches)document.querySelectorAll('.scroll-reveal').forEach(el=>el.classList.add('is-visible'))
  }
  );
}
