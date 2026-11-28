/**
 * Réparation automatique : si la page s'affiche sans sa feuille de style (fichier introuvable après une mise à jour,
 * Wi-Fi pas encore revenu au réveil d'un boîtier TV, onglet restauré depuis une vieille copie…),
 * on recharge la page dès que la connexion est là. Au plus 3 essais en 2 minutes, pour ne jamais boucler.
 * Écrit en JavaScript ancien (ES5) : il doit tourner même sur les navigateurs de télévision.
 */
const SCRIPT = `(function(){
  var KEY='dawri:style-heal';
  function styled(){try{return getComputedStyle(document.documentElement).getPropertyValue('--dawri-css').replace(/\\s/g,'')!==''}catch(e){return true}}
  function clean(){try{if(location.search.indexOf('_r=')<0)return;var u=new URL(location.href);u.searchParams.delete('_r');history.replaceState(history.state,'',u.toString())}catch(e){}}
  function heal(){
    if(styled()){clean();return}
    if(navigator.onLine===false){window.addEventListener('online',function(){setTimeout(heal,2000)});return}
    var now=Date.now(),n=0;
    try{var s=JSON.parse(sessionStorage.getItem(KEY)||'null');if(s&&now-s.t<120000)n=s.n;sessionStorage.setItem(KEY,JSON.stringify({n:n+1,t:now}))}catch(e){return}
    if(n>=3)return;
    try{var u=new URL(location.href);u.searchParams.set('_r',String(now));location.replace(u.toString())}catch(e){location.reload()}
  }
  function later(){setTimeout(heal,1500)}
  if(document.readyState==='complete')later();else window.addEventListener('load',later);
})();`;

export default function StyleGuard() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
