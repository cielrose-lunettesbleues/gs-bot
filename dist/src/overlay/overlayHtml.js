"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverlayHtml = getOverlayHtml;
function getOverlayHtml() {
    return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent}
#wrap{
  position:absolute;inset:0;
  opacity:0;transition:opacity .4s ease;
  display:flex;align-items:center;justify-content:center;
}
#wrap.visible{opacity:1}
video,img{
  position:absolute;inset:0;
  width:100%;height:100%;
  object-fit:contain;
  border:none;
}
/* YouTube wrapper: overflow:hidden clips the player chrome */
.yt-wrap{
  position:absolute;inset:0;
  overflow:hidden;
}
.yt-wrap.yt-short{
  inset:unset;
  top:0;bottom:0;height:100%;
  width:calc(100vh * 9 / 16);
  left:50%;transform:translateX(-50%);
}
/* iframe 8% oversized so the chrome (title bar, borders) is cropped */
.yt-wrap iframe{
  position:absolute;
  left:-4%;top:-4%;
  width:108%;height:108%;
  border:none;
  pointer-events:none;
}
iframe{
  position:absolute;inset:0;
  width:100%;height:100%;
  border:none;
}
#info{
  position:absolute;bottom:0;left:0;right:0;
  padding:12px 20px;
  background:linear-gradient(transparent,rgba(0,0,0,.6));
  color:#fff;font-family:sans-serif;font-size:15px;
  opacity:0;transition:opacity .4s;
  pointer-events:none;
}
#info.visible{opacity:1}
</style>
</head>
<body>
<div id="wrap">
  <div id="media"></div>
</div>
<div id="info"><span id="info-user"></span></div>

<script>
(function(){
  var wrap = document.getElementById('wrap');
  var mediaEl = document.getElementById('media');
  var info = document.getElementById('info');
  var infoUser = document.getElementById('info-user');

  // URL params: ?info=1 to show the username bar
  var showInfo = new URLSearchParams(location.search).get('info') === '1';

  function ytId(url){
    var m = url.match(/(?:youtube\\.com\\/watch\\?.*v=|youtu\\.be\\/|youtube\\.com\\/shorts\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  // Listen for YouTube state changes (enablejsapi=1 sends postMessage to parent)
  // info === 0 means ended
  window.addEventListener('message', function(ev){
    if(ev.origin !== 'https://www.youtube.com') return;
    try {
      var d = JSON.parse(ev.data);
      if(d.event === 'onStateChange' && d.info === 0) hide();
    } catch(e){}
  });

  function buildMedia(url){
    var id = ytId(url);
    if(id){
      var isShort = /youtube\\.com\\/shorts\\//.test(url);
      var f=document.createElement('iframe');
      f.src='https://www.youtube.com/embed/'+id
        +'?autoplay=1&controls=0&modestbranding=1&rel=0'
        +'&enablejsapi=1&origin='+encodeURIComponent(location.origin)
        +'&iv_load_policy=3&disablekb=1';
      f.allow='autoplay; fullscreen';
      // Wrap in overflow:hidden container so the 108% iframe crops the player chrome
      var w=document.createElement('div');
      w.className='yt-wrap'+(isShort?' yt-short':'');
      w.appendChild(f);
      return w;
    }
    if(/\\.(gif|png|jpg|jpeg|webp)(\\?.*)?$/i.test(url)){
      var i=document.createElement('img');
      i.src=url;
      return i;
    }
    var v=document.createElement('video');
    v.src=url;
    v.autoplay=true;
    v.playsInline=true;
    v.addEventListener('ended', hide);
    return v;
  }

  function show(data){
    mediaEl.innerHTML='';
    mediaEl.appendChild(buildMedia(data.url));
    requestAnimationFrame(function(){wrap.classList.add('visible');});
    if(showInfo){
      infoUser.textContent='@'+data.username;
      info.classList.add('visible');
    }
  }

  function hide(){
    wrap.classList.remove('visible');
    info.classList.remove('visible');
    setTimeout(function(){mediaEl.innerHTML='';},500);
  }

  function connect(){
    var parts=location.pathname.split('/').filter(Boolean);
    var channel=parts[parts.length-1]||'';
    var es=new EventSource('/overlay/'+channel+'/events');
    es.onmessage=function(ev){
      var d=JSON.parse(ev.data);
      if(d.type==='start') show(d);
      else if(d.type==='stop') hide();
    };
    es.onerror=function(){
      es.close();
      setTimeout(connect,3000);
    };
  }

  connect();
})();
</script>
</body>
</html>`;
}
