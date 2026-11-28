/**
 * Écran de salle « de secours » : HTML simple, style intégré, script ES5 — aucune dépendance au système de style
 * du site. Il fonctionne sur les navigateurs anciens des boîtiers TV (WebView Android trop vieille pour
 * l'écran normal), vers lesquels /d/[slug] redirige automatiquement. Aucun nom de patient n'est affiché.
 */
import QRCode from "qrcode";
import { DomainError } from "@/lib/domain/types";
import { dirOf, drTitle, t } from "@/lib/i18n";
import { baseUrl, getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data;
  try {
    data = await publicShop(slug);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) return new Response("Not found", { status: 404 });
    throw e;
  }
  const { shop, view } = data;
  const lang = await getLang(shop.defaultLang);
  const url = `${await baseUrl()}/s/${shop.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0b1b2b", light: "#ffffff" } });
  const doctor = [drTitle(lang, shop.kind, shop.profile.doctorName), shop.profile.specialty].filter(Boolean).join(" · ");
  const T = {
    now: t(lang, "displayNow"),
    enter: t(lang, "dp_enter"),
    upcoming: t(lang, "dp_upcoming"),
    waiting: t(lang, "waitingCount"),
    empty: t(lang, "emptyQueue"),
    soon: t(lang, "dp_soon"),
    number: t(lang, "dp_number"),
    say: t(lang, "dp_say", { n: "{n}" }),
    sound: t(lang, "soundEnable"),
    scanTitle: t(lang, "posterTitle"),
    scan: t(lang, "dp_scan"),
    footer: t(lang, "dp_footer"),
    hint: t(lang, "dp_liteHint"),
  };
  const init = { slug: shop.slug, lang, current: view.currentNumber, next: view.nextNumbers, waiting: view.waiting, blocker: view.blocker, T };
  const html = `<!doctype html>
<html lang="${lang}" dir="${dirOf(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(shop.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;background:#0b1b2b;color:#fff;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif}
#top{height:14vh;display:-webkit-box;display:flex;align-items:center;justify-content:space-between;padding:0 3vw;background:#12305c}
#top h1{font-size:4.4vh;line-height:1.15}#top p{font-size:2.6vh;color:#b9cdf2;margin-top:.6vh}
#clock{font-size:6vh;font-weight:bold;letter-spacing:.3vh}
#main{height:78vh;display:-webkit-box;display:flex}
#cur{-webkit-box-flex:1.7;flex:1.7;display:-webkit-box;display:flex;-webkit-box-orient:vertical;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#lbl{font-size:4vh;color:#9fe3c2;font-weight:bold;letter-spacing:.3vh}
#num{font-size:34vh;font-weight:bold;line-height:1;margin:1vh 0}
#msg{font-size:4.6vh;font-weight:bold}
#side{-webkit-box-flex:1;flex:1;padding:3vh 3vw;background:#0f2442;display:-webkit-box;display:flex;-webkit-box-orient:vertical;flex-direction:column}
.k{font-size:2.8vh;color:#b9cdf2;font-weight:bold}
#next{font-size:7vh;font-weight:bold;margin:1vh 0 2.5vh}#next span{display:inline-block;margin-inline-end:3vw}
#wait{font-size:6vh;font-weight:bold;margin:.6vh 0 2.5vh}
#qrbox{background:#fff;color:#0b1b2b;border-radius:2vh;padding:1.6vh;display:-webkit-box;display:flex;align-items:center;margin-top:auto}
#qrbox svg{width:20vh;height:20vh;-webkit-flex:none;flex:none}
#qrbox div{margin-inline-start:2vh}#qrbox b{display:block;font-size:2.8vh}#qrbox small{display:block;font-size:2.1vh;margin-top:.8vh;color:#334155}
#foot{height:8vh;display:-webkit-box;display:flex;align-items:center;justify-content:space-between;padding:0 3vw;font-size:2vh;color:#8aa3cf}
#snd{background:#10b981;color:#fff;border:0;border-radius:1.2vh;font-size:2.6vh;font-weight:bold;padding:1.2vh 2.4vh;cursor:pointer}
#call{position:fixed;top:0;left:0;right:0;bottom:0;background:#059669;display:none;-webkit-box-orient:vertical;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#call .a{font-size:6vh;font-weight:bold}#call .n{font-size:45vh;font-weight:bold;line-height:1}#call .b{font-size:6vh;font-weight:bold}
</style></head>
<body>
<div id="top"><div><h1>${esc(shop.name)}</h1><p>${esc(doctor)}</p></div><div id="clock"></div></div>
<div id="main">
  <div id="cur"><div id="lbl">${esc(T.now)}</div><div id="num"></div><div id="msg"></div></div>
  <div id="side">
    <div class="k">${esc(T.upcoming)}</div><div id="next"></div>
    <div class="k">${esc(T.waiting)}</div><div id="wait"></div>
    <div id="qrbox">${qr}<div><b>${esc(T.scanTitle)}</b><small>${esc(T.scan)}</small></div></div>
  </div>
</div>
<div id="foot"><span>${esc(T.footer)} — ${esc(T.hint)}</span><button id="snd" type="button">${esc(T.sound)}</button></div>
<div id="call"><div class="a">${esc(T.number)}</div><div class="n" id="calln"></div><div class="b">${esc(T.enter)}</div></div>
<script>
var S=${JSON.stringify(init).replace(/</g, "\\u003c")};
(function(){
  var $=function(id){return document.getElementById(id)};
  var last=S.current, ctx=null, started=Date.now(), timer=null;
  function render(v){
    var busy=v.current!==null&&v.current!==undefined;
    $('num').innerHTML=busy?String(v.current):'&middot; &middot; &middot;';
    $('msg').innerHTML=busy?S.T.enter:(v.blocker?S.T.soon:S.T.empty);
    var h='',n=v.next||[];for(var i=0;i<n.length;i++)h+='<span>'+n[i]+'</span>';
    $('next').innerHTML=h||'&mdash;';
    $('wait').innerHTML=String(v.waiting||0);
  }
  function beep(){
    if(!ctx)return;
    try{var t0=ctx.currentTime+0.02,f=[[784,0],[523,0.35]];
      for(var i=0;i<f.length;i++){var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f[i][0];
        g.gain.setValueAtTime(0.0001,t0+f[i][1]);g.gain.exponentialRampToValueAtTime(0.5,t0+f[i][1]+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t0+f[i][1]+0.6);
        o.connect(g);g.connect(ctx.destination);o.start(t0+f[i][1]);o.stop(t0+f[i][1]+0.65);}
    }catch(e){}
  }
  function say(n){
    try{if(!ctx||!window.speechSynthesis)return;var u=new SpeechSynthesisUtterance(S.T.say.replace('{n}',n));
      u.lang=S.lang==='ar'?'ar-SA':'fr-FR';u.rate=0.9;window.speechSynthesis.cancel();setTimeout(function(){window.speechSynthesis.speak(u)},1200);}catch(e){}
  }
  function called(n){
    $('calln').innerHTML=String(n);$('call').style.display='-webkit-box';$('call').style.display='flex';
    beep();say(n);setTimeout(function(){$('call').style.display='none'},7000);
  }
  function poll(){
    var x=new XMLHttpRequest();
    x.open('GET','/api/s/'+encodeURIComponent(S.slug)+'?_='+Date.now(),true);
    x.onreadystatechange=function(){
      if(x.readyState!==4)return;
      var v=null;try{if(x.status===200)v=JSON.parse(x.responseText)}catch(e){}
      if(v){
        var cur=v.currentNumber===undefined?null:v.currentNumber;
        if(cur!==null&&cur!==last)called(cur);
        last=cur;S.current=cur;S.next=v.nextNumbers;S.waiting=v.waiting;S.blocker=v.blocker;
        render(S);
        // une fois par jour environ, quand rien ne se passe : on recharge pour suivre les mises à jour
        if(Date.now()-started>12*3600000&&cur===null&&!v.waiting)location.reload();
      }
      var busy=S.current!==null||S.waiting>0;
      timer=setTimeout(poll,busy?4000:(S.blocker?30000:12000));
    };
    x.send();
  }
  function tick(){
    var d=new Date(),s;
    try{s=d.toLocaleTimeString(S.lang==='ar'?'ar-DZ-u-nu-latn':'fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Algiers'})}
    catch(e){s=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
    $('clock').innerHTML=s;
  }
  $('snd').onclick=function(){
    try{var A=window.AudioContext||window.webkitAudioContext;if(A){ctx=ctx||new A();if(ctx.resume)ctx.resume();beep()}}catch(e){}
    $('snd').style.display='none';
  };
  render(S);tick();setInterval(tick,10000);timer=setTimeout(poll,4000);
})();
</script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
