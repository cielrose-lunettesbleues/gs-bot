export function getOverlayHtml(): string {
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
  background:transparent;
}
#wrap.visible{opacity:1}
video,img{
  position:absolute;inset:0;
  width:100%;height:100%;
  object-fit:contain;
  background:transparent;
  border:none;
}
/* YouTube wrapper: overflow:hidden clips the player chrome */
.yt-wrap{
  position:absolute;inset:0;
  overflow:hidden;
  background:transparent;
}
/* iframe 12% oversized so the chrome (title bar, borders) is cropped */
.yt-wrap iframe{
  position:absolute;
  left:-6%;top:-6%;
  width:112%;height:112%;
  border:none;
  pointer-events:none;
}
/*
 * Shorts: centred 9:16 column. YouTube always renders internally in 16:9,
 * pillarboxing the portrait video — so the sides can never be truly empty.
 * Fix: blurred + darkened thumbnail fills the 16:9 canvas (same as TikTok/Reels).
 */
.yt-short-bg{
  position:absolute;inset:-5%;
  background-size:cover;background-position:center;
  filter:blur(24px) brightness(.4);
}
.yt-short-inner{
  position:absolute;
  top:0;bottom:0;height:100%;
  width:calc(100vh * 9 / 16);
  left:50%;transform:translateX(-50%);
  overflow:hidden;
}
.yt-short-inner iframe{
  position:absolute;
  left:-6%;top:-6%;
  width:112%;height:112%;
  border:none;
  pointer-events:none;
}
/* TikTok: same 9:16 column — video plays as <video> (no iframe) */
.tk-short-inner{
  position:absolute;
  top:0;bottom:0;height:100%;
  width:calc(100vh * 9 / 16);
  left:50%;transform:translateX(-50%);
  overflow:hidden;
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
#caption{
  position:absolute;bottom:24px;left:0;right:0;
  text-align:center;
  font-family:Impact,'Arial Narrow',Arial,sans-serif;
  font-weight:bold;
  font-size:clamp(24px,6vw,72px);
  color:#fff;
  text-transform:uppercase;
  text-shadow:
    -3px -3px 0 #000, 3px -3px 0 #000,
    -3px  3px 0 #000, 3px  3px 0 #000,
    -3px  0   0 #000, 3px  0   0 #000,
     0   -3px 0 #000, 0    3px 0 #000;
  padding:0 32px;
  opacity:0;transition:opacity .4s;
  pointer-events:none;
  word-break:break-word;
  line-height:1.1;
}
#caption.visible{opacity:1}
</style>
</head>
<body>
<div id="wrap">
  <div id="media"></div>
</div>
<div id="info"><span id="info-user"></span></div>
<div id="caption"></div>

<script>
(function(){
  var wrap = document.getElementById('wrap');
  var mediaEl = document.getElementById('media');
  var info = document.getElementById('info');
  var infoUser = document.getElementById('info-user');
  var captionEl = document.getElementById('caption');

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

  function buildMedia(url, portrait){
    var id = ytId(url);
    if(id){
      var isShort = /youtube\\.com\\/shorts\\//.test(url);
      var f=document.createElement('iframe');
      f.src='https://www.youtube.com/embed/'+id
        +'?autoplay=1&controls=0&modestbranding=1&rel=0'
        +'&enablejsapi=1&origin='+encodeURIComponent(location.origin)
        +'&iv_load_policy=3&disablekb=1&loop=1&playlist='+id;
      f.allow='autoplay; fullscreen';
      var w=document.createElement('div');
      w.className='yt-wrap';
      if(isShort){
        var bg=document.createElement('div');
        bg.className='yt-short-bg';
        bg.style.backgroundImage='url(https://img.youtube.com/vi/'+id+'/maxresdefault.jpg)';
        w.appendChild(bg);
        var inner=document.createElement('div');
        inner.className='yt-short-inner';
        inner.appendChild(f);
        w.appendChild(inner);
      } else {
        w.appendChild(f);
      }
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
    if(portrait){
      var c=document.createElement('div');
      c.className='tk-short-inner';
      c.appendChild(v);
      return c;
    }
    return v;
  }

  var hideTimer = null;

  function show(data){
    if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; }
    mediaEl.innerHTML='';
    mediaEl.appendChild(buildMedia(data.url, data.portrait));
    requestAnimationFrame(function(){wrap.classList.add('visible');});
    if(showInfo){
      infoUser.textContent='@'+data.username;
      info.classList.add('visible');
    }
    if(data.caption){
      captionEl.textContent=data.caption;
      captionEl.classList.add('visible');
    }
    // Client-side fallback timer for YouTube and GIFs (no native 'ended' event)
    if(data.durationSeconds && !(/\\.(mp4|webm|mov)(\\?.*)?$/i.test(data.url))){
      hideTimer=setTimeout(hide, Math.max(data.durationSeconds*1000-500, 500));
    }
  }

  function hide(){
    if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; }
    wrap.classList.remove('visible');
    info.classList.remove('visible');
    captionEl.classList.remove('visible');
    setTimeout(function(){mediaEl.innerHTML='';captionEl.textContent='';},500);
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
