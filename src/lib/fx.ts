// Guaranteed presentation layer injected into every generated course:
// pure-black page, animated ambient background, cinematic opening, scroll reveals
// and a Motion on/off switch. Idempotent, and independent of what the model wrote.

const MARK = 'id="fx-style"'

const FX_CSS = String.raw`
html{background:#000!important;color-scheme:dark}
body,body>div:not(#fx-intro):not(#fx-glow),body>main,body>section,body>article,main,.page,.app,.app-shell,.main,.wrapper,.site,#app,#root{background:transparent!important;background-image:none!important}
aside,.sidebar,.sidenav,body>header,body>nav,.topbar{background:rgba(0,0,0,.8)!important;background-image:none!important}
#fx-bg{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
#fx-glow{position:fixed;left:0;top:0;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;pointer-events:none;z-index:-1;opacity:0;transition:opacity .6s;background:radial-gradient(circle,var(--fx-a,rgba(201,162,74,.5)) 0%,transparent 65%);will-change:transform}
#fx-glow.on{opacity:.13}

#fx-motion{position:fixed;top:12px;right:14px;z-index:2147483001;display:flex;align-items:center;gap:9px;padding:7px 12px 7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(8,8,10,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#cfcfcf;font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;min-height:34px}
#fx-motion:hover{border-color:rgba(255,255,255,.4);color:#fff}
#fx-motion i{position:relative;width:30px;height:17px;border-radius:999px;background:rgba(255,255,255,.18);transition:background .25s}
#fx-motion i::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:transform .25s}
#fx-motion[aria-checked="true"] i{background:var(--fx-c,#c9a24a)}
#fx-motion[aria-checked="true"] i::after{transform:translateX(13px)}

#fx-intro{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center;padding:24px;cursor:pointer;animation:fxOut .9s ease 3.1s forwards}
#fx-intro svg{width:min(240px,52vw);height:auto;overflow:visible}
#fx-intro .ring{fill:none;stroke:var(--fx-c,#c9a24a);stroke-width:1;stroke-dasharray:1;stroke-dashoffset:1;animation:fxDraw 1.9s ease .15s forwards;opacity:.9}
#fx-intro .ring.b{animation-delay:.5s;opacity:.55}
#fx-intro .ring.c{animation-delay:.9s;opacity:.35}
#fx-intro .dot{fill:var(--fx-c,#c9a24a);opacity:0;animation:fxFade .8s ease 1.6s forwards}
#fx-intro .kick{font:500 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.34em;text-transform:uppercase;color:var(--fx-c,#c9a24a);opacity:0;animation:fxFade .9s ease 1.0s forwards}
#fx-intro .ttl{max-width:900px;font:600 clamp(1.7rem,5.6vw,3.6rem)/1.08 Georgia,'Times New Roman',serif;color:#f4efe6;letter-spacing:-.01em}
#fx-intro .ttl span{display:inline-block;opacity:0;transform:translateY(.7em);filter:blur(8px);animation:fxWord .9s cubic-bezier(.2,.7,.2,1) forwards}
#fx-intro .skip{position:absolute;bottom:26px;font:11px ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.28);opacity:0;animation:fxFade 1s ease 1.4s forwards}
@keyframes fxDraw{to{stroke-dashoffset:0}}
@keyframes fxFade{to{opacity:1}}
@keyframes fxWord{to{opacity:1;transform:none;filter:none}}
@keyframes fxOut{to{opacity:0;visibility:hidden}}

html.fx-ready .fx-r{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);transition-delay:var(--fx-d,0ms)}
html.fx-ready .fx-r.fx-in{opacity:1;transform:none}
.fx-sweep{display:block;height:1px;width:100%;max-width:340px;margin:10px 0 0;background:linear-gradient(90deg,var(--fx-c,#c9a24a),transparent);transform-origin:left;transform:scaleX(0)}
.fx-sweep.fx-in{animation:fxSweep 1.4s cubic-bezier(.2,.7,.2,1) forwards}
.fx-title.fx-in{animation:fxTitle 1.1s cubic-bezier(.2,.7,.2,1) both}
@keyframes fxSweep{to{transform:scaleX(1)}}
@keyframes fxTitle{from{opacity:0;letter-spacing:.14em;filter:blur(8px);transform:translateY(14px)}to{opacity:1;letter-spacing:inherit;filter:none;transform:none}}

html.no-motion *,html.no-motion *::before,html.no-motion *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
html.no-motion #fx-bg,html.no-motion #fx-glow,html.no-motion #fx-intro{display:none!important}
html.no-motion .fx-r{opacity:1!important;transform:none!important}
html.no-motion .fx-sweep{transform:none!important}
@media (prefers-reduced-motion:reduce){#fx-intro{display:none!important}}
@media(max-width:600px){#fx-motion{top:8px;right:8px;padding:6px 10px}#fx-motion span{display:none}}
`

const FX_JS = String.raw`(function(){
var root=document.documentElement,KEY='fx-motion',store=null;
try{store=window.localStorage}catch(e){}
function rd(){try{return store&&store.getItem(KEY)}catch(e){return null}}
function wr(v){try{store&&store.setItem(KEY,v)}catch(e){}}
var rm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(rd()==='off'||(rm&&rd()!=='on'))root.classList.add('no-motion');
function motionOn(){return !root.classList.contains('no-motion')}

/* accent colour sampled from the page itself */
function hsl(c){var m=c.match(/[\d.]+/g);if(!m||m.length<3)return null;var r=+m[0]/255,g=+m[1]/255,b=+m[2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,s=mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1));return{s:s,l:l,r:+m[0],g:+m[1],b:+m[2]}}
var accent=[201,162,74];
(function(){var sel=['.eyebrow','.kicker','h3','h2','a','strong','em','.btn','button','[class*=accent]','[class*=gold]','[class*=brass]','h1'];
for(var i=0;i<sel.length;i++){var els=document.querySelectorAll(sel[i]);for(var j=0;j<Math.min(els.length,12);j++){var c=hsl(getComputedStyle(els[j]).color);if(c&&c.s>.28&&c.l>.35&&c.l<.85){accent=[c.r,c.g,c.b];i=99;break}}}
var rgb='rgb('+accent.join(',')+')';root.style.setProperty('--fx-c',rgb);root.style.setProperty('--fx-a','rgba('+accent.join(',')+',.55)')})();

/* motion switch */
var sw=document.createElement('button');sw.id='fx-motion';sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-label','Toggle animations');
sw.innerHTML='<span>Motion</span><i></i>';
function sync(){sw.setAttribute('aria-checked',motionOn()?'true':'false')}
sw.addEventListener('click',function(){root.classList.toggle('no-motion');wr(motionOn()?'on':'off');sync();if(motionOn())loop()});
document.body.appendChild(sw);sync();

/* opening sequence */
var intro=document.getElementById('fx-intro');
if(intro){
  if(!motionOn()){intro.remove();intro=null}
  else{
    var tt=intro.querySelector('.ttl'),words=(tt.getAttribute('data-t')||'').split(/\s+/).filter(Boolean);
    tt.innerHTML=words.map(function(w,i){return'<span style="animation-delay:'+(0.9+i*0.09).toFixed(2)+'s">'+w.replace(/[<&]/g,'')+'</span>'}).join(' ');
    var gone=false;function done(){if(gone)return;gone=true;intro.style.transition='opacity .6s';intro.style.opacity='0';setTimeout(function(){intro&&intro.remove()},650)}
    intro.addEventListener('click',done);window.addEventListener('keydown',done,{once:true});setTimeout(done,4100);
  }
}

/* ambient field: drifting nodes, links, cursor attraction */
var cv=document.createElement('canvas');cv.id='fx-bg';document.body.insertBefore(cv,document.body.firstChild);
var glow=document.createElement('div');glow.id='fx-glow';document.body.insertBefore(glow,document.body.firstChild);
var cx=cv.getContext('2d'),W=0,H=0,D=1,N=[],mx=-9999,my=-9999,run=false;
function size(){D=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;cv.width=W*D;cv.height=H*D;cx.setTransform(D,0,0,D,0,0);
  var n=Math.max(28,Math.min(90,Math.floor(W*H/17000)));N=[];for(var i=0;i<n;i++)N.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.22,vy:(Math.random()-.5)*.22-.04,r:.6+Math.random()*1.5,p:Math.random()*6.28})}
function frame(t){
  cx.clearRect(0,0,W,H);var a=accent.join(',');
  for(var i=0;i<N.length;i++){var p=N[i];p.x+=p.vx;p.y+=p.vy;p.p+=.012;
    if(p.x<-20)p.x=W+20;if(p.x>W+20)p.x=-20;if(p.y<-20)p.y=H+20;if(p.y>H+20)p.y=-20;
    var dx=mx-p.x,dy=my-p.y,d=Math.sqrt(dx*dx+dy*dy);
    if(d<190){p.x+=dx*.0016;p.y+=dy*.0016}
    var al=.28+.22*Math.sin(p.p);
    cx.beginPath();cx.arc(p.x,p.y,p.r,0,6.283);cx.fillStyle='rgba('+a+','+al.toFixed(3)+')';cx.fill();
    for(var j=i+1;j<N.length;j++){var q=N[j],ex=p.x-q.x,ey=p.y-q.y,dd=ex*ex+ey*ey;
      if(dd<14400){cx.beginPath();cx.moveTo(p.x,p.y);cx.lineTo(q.x,q.y);cx.strokeStyle='rgba('+a+','+(.1*(1-dd/14400)).toFixed(3)+')';cx.lineWidth=.6;cx.stroke()}}
    if(d<170){cx.beginPath();cx.moveTo(p.x,p.y);cx.lineTo(mx,my);cx.strokeStyle='rgba('+a+','+(.22*(1-d/170)).toFixed(3)+')';cx.lineWidth=.7;cx.stroke()}
  }
}
function loop(){if(run||!motionOn()||document.hidden)return;run=true;(function tick(){if(!motionOn()||document.hidden){run=false;return}frame();requestAnimationFrame(tick)})()}
size();window.addEventListener('resize',size,{passive:true});
window.addEventListener('pointermove',function(e){mx=e.clientX;my=e.clientY;glow.classList.add('on');glow.style.transform='translate('+mx+'px,'+my+'px)'},{passive:true});
window.addEventListener('pointerleave',function(){mx=my=-9999;glow.classList.remove('on')});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&motionOn())loop()});
if(motionOn())loop();else frame();

/* scroll reveals + section-title openings */
if('IntersectionObserver' in window){
  var tg=document.querySelectorAll('section>*,article>*,.part>*,.section>*,.chapter>*,main>*,.container>*');
  var seen=new Set(),io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('fx-in');io.unobserve(e.target)}})},{threshold:.08,rootMargin:'0px 0px -6% 0px'});
  tg.forEach(function(el){
    if(seen.has(el)||el.id==='fx-intro'||el.id==='fx-bg'||el.id==='fx-glow'||el.id==='fx-motion'||/^(SCRIPT|STYLE|CANVAS)$/.test(el.tagName))return;seen.add(el);
    var i=Array.prototype.indexOf.call(el.parentNode.children,el);el.style.setProperty('--fx-d',Math.min(i*45,270)+'ms');
    if(/^H[12]$/.test(el.tagName)){el.classList.add('fx-title');var s=document.createElement('span');s.className='fx-sweep';el.insertAdjacentElement('afterend',s);io.observe(s);io.observe(el)}
    else{el.classList.add('fx-r');io.observe(el)}
  });
  root.classList.add('fx-ready');
}
})();`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function hasFx(html: string): boolean {
  return html.includes(MARK)
}

export function enhanceCourseHtml(
  html: string,
  opts: { title: string; kicker?: string },
): string {
  if (!html || hasFx(html)) return html
  const style = `<style ${MARK}>${FX_CSS}</style>`
  const intro =
    `<div id="fx-intro" aria-hidden="true"><svg viewBox="0 0 200 200">` +
    `<polygon class="ring" pathLength="1" points="100,10 184,70 152,170 48,170 16,70"/>` +
    `<polygon class="ring b" pathLength="1" points="100,34 162,80 138,152 62,152 38,80"/>` +
    `<circle class="ring c" pathLength="1" cx="100" cy="100" r="88"/>` +
    `<circle class="dot" cx="100" cy="100" r="3.2"/></svg>` +
    `${opts.kicker ? `<div class="kick">${esc(opts.kicker)}</div>` : ''}` +
    `<div class="ttl" data-t="${esc(opts.title)}">${esc(opts.title)}</div>` +
    `<div class="skip">click to skip</div></div>`
  const script = `<script id="fx-script">${FX_JS}</script>`

  let out = html
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, () => style + '</head>') : style + out
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body[^>]*>/i, (m) => m + intro) : intro + out
  out = /<\/body>/i.test(out)
    ? out.replace(/<\/body>/i, () => script + '</body>')
    : out.replace(/<\/html>/i, () => script + '</html>')
  return out
}
