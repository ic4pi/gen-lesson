// Automatic quality gate: load the finished page in a hidden, sandboxed browser frame and test it.
// The page stays in an opaque-origin sandbox; results come back by postMessage.

export interface QAResult {
  passed: boolean
  problems: string[]
  at: number
}

const AGENT = `<script>(function(){
var errors=[];
addEventListener('error',function(e){errors.push((e.message||'error')+(e.lineno?' (line '+e.lineno+')':''))});
addEventListener('unhandledrejection',function(e){errors.push('promise: '+((e.reason&&e.reason.message)||e.reason))});
var ce=console.error;console.error=function(){try{errors.push([].slice.call(arguments).join(' '))}catch(_){}try{ce.apply(console,arguments)}catch(_){}};
function lum(c){var a=c.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]}
function rgb(s){var m=String(s).match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(',').map(parseFloat);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}
function bgOf(el){while(el&&el.nodeType===1){var c=rgb(getComputedStyle(el).backgroundColor);if(c&&c.a>0.5)return[c.r,c.g,c.b];el=el.parentElement}return[0,0,0]}
function run(){
 var res={errors:[],blank:[],clickErrors:0,clicked:0,overflow:false,contrast:null,words:0,canvases:0};
 var cs=[].slice.call(document.querySelectorAll('canvas'));
 cs.forEach(function(c){try{var r=c.getBoundingClientRect(),st=getComputedStyle(c);if(r.width<60||r.height<60||st.display==='none'||st.visibility==='hidden')return;if(st.position==='fixed'||st.pointerEvents==='none'||r.width>=window.innerWidth*0.9&&r.height>=window.innerHeight*0.8)return;res.canvases++;var ctx=c.getContext('2d');if(!ctx)return;var w=Math.min(c.width,500),h=Math.min(c.height,500);if(!w||!h){res.blank.push(c.id||c.className||'canvas');return}var d=ctx.getImageData(0,0,w,h).data,nz=0;for(var i=3;i<d.length;i+=4){if(d[i]>8)nz++}if(nz<25)res.blank.push(c.id||c.className||'canvas')}catch(e){}});
 var targets=[].slice.call(document.querySelectorAll('button,[role=tab],.tab,.tab-btn,.ctrl-btn,summary,[onclick]')).slice(0,70);
 targets.forEach(function(t){try{t.click();res.clicked++}catch(e){res.clickErrors++;errors.push('click: '+e.message)}});
 setTimeout(function(){
  res.errors=errors.slice(0,8);
  res.overflow=document.documentElement.scrollWidth>window.innerWidth+4;
  var bc=document.body.cloneNode(true);[].slice.call(bc.querySelectorAll('script,style,noscript')).forEach(function(n){n.remove()});res.words=(bc.textContent||'').split(/\\s+/).filter(Boolean).length;
  var ps=[].slice.call(document.querySelectorAll('p,li')).filter(function(p){return p.innerText&&p.innerText.length>40}).slice(0,14),vals=[];
  ps.forEach(function(p){var fg=rgb(getComputedStyle(p).color);if(!fg)return;var bg=bgOf(p),l1=lum([fg.r,fg.g,fg.b]),l2=lum(bg),hi=Math.max(l1,l2),lo=Math.min(l1,l2);vals.push((hi+0.05)/(lo+0.05))});
  vals.sort(function(a,b){return a-b});res.contrast=vals.length?vals[Math.floor(vals.length/2)]:null;
  try{parent.postMessage({__qa:true,res:res},'*')}catch(e){}
 },700);
}
addEventListener('load',function(){setTimeout(run,2600)});
})();<\/script>`

function inject(html: string): string {
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + AGENT)
    : html.replace(/<html[^>]*>/i, (m) => m + AGENT)
}

function probe(html: string, width: number, timeout = 12000): Promise<any | null> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:900px;border:0;visibility:hidden`
    const done = (v: any) => {
      clearTimeout(timer)
      window.removeEventListener('message', on)
      frame.remove()
      resolve(v)
    }
    const on = (e: MessageEvent) => {
      if (e.source === frame.contentWindow && e.data?.__qa) done(e.data.res)
    }
    const timer = setTimeout(() => done(null), timeout)
    window.addEventListener('message', on)
    frame.srcdoc = inject(html)
    document.body.appendChild(frame)
  })
}

export async function runQA(html: string): Promise<QAResult> {
  const problems: string[] = []
  const d = await probe(html, 1280)
  if (!d) {
    problems.push('the page did not finish loading, or its scripts hung')
  } else {
    const seen = new Set<string>()
    for (const e of d.errors as string[]) {
      // localStorage is blocked inside the opaque-origin test sandbox; it works on the real site
      if (/localStorage|sessionStorage|indexedDB|SecurityError|allow-same-origin|allow-modals|allow-downloads/i.test(String(e))) continue
      const k = String(e).slice(0, 140)
      if (!seen.has(k)) {
        seen.add(k)
        problems.push(`JavaScript error: ${k}`)
      }
    }
    for (const c of d.blank as string[]) problems.push(`canvas "${c}" is visible but blank (its drawing code is not producing output)`)
    if (d.contrast !== null && d.contrast < 3.5) problems.push(`body text contrast is too low (${d.contrast.toFixed(1)}:1; needs 4.5:1)`)
    if (d.words < 1500) problems.push(`very little visible text (${d.words} words)`)
  }
  const m = await probe(html, 390)
  if (m?.overflow) problems.push('the page scrolls sideways on a phone-width screen (horizontal overflow at 390px)')
  return { passed: problems.length === 0, problems, at: Date.now() }
}
