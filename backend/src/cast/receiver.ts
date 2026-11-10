/**
 * Aura's TV screen for Google Cast — a Custom Web Receiver served at GET /cast/receiver.
 * Register this URL in the Google Cast SDK Developer Console to get an App ID
 * (see docs/DLNA.md → "Aura on the TV"). Preview in a browser: /cast/receiver?demo=1
 * (add &lyrics=1 for the lyrics layout).
 *
 * Kept as a string so it ships inside the compiled server (Vercel bundles dist/ only).
 */
export const RECEIVER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aura</title>
<!--
  Aura's TV screen for Google Cast (a "Custom Web Receiver").
  Runs on the Chromecast itself. Written for the slowest device we support, the
  1st-gen Chromecast: plain ES2015 (no ?. or ??), no CSS blur / backdrop-filter,
  and only opacity / transform animations, which its GPU composites cheaply.

  The phone sends, in MediaInfo.customData (and later on urn:x-cast:app.aura):
    { aura: 1, palette: [dark, dominant, vibrant], quality: "HI-RES 24/96",
      lyrics: [[ms, "line"], ...] | null, next: { title, artist } | null }
  Open with ?demo=1 in a browser to preview without a Chromecast.
-->
<style>
  :root { --c1: #16161d; --c2: #2a2a35; --c3: #ff5a36; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0b0b10; color: #fff;
    font-family: "Google Sans", Roboto, "Open Sans", "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased; }
  /* Two background layers crossfade between songs (opacity only). */
  .bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; opacity: 0; transition: opacity 1.2s ease; }
  .bg.on { opacity: 1; }
  .bg .shade { position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.55) 100%); }

  .brand { position: fixed; top: 5.5vh; left: 5vw; font-size: 3.3vh; font-weight: 700; letter-spacing: 0.02em;
    opacity: 0.92; display: flex; align-items: center; }
  .brand i { display: inline-block; width: 2.6vh; height: 2.6vh; border-radius: 50%; margin-right: 1.1vh;
    background: linear-gradient(135deg, #fff, rgba(255,255,255,0.35)); }
  .badge { position: fixed; top: 5.6vh; right: 5vw; font-size: 2.1vh; font-weight: 700; letter-spacing: 0.08em;
    padding: 0.7vh 1.4vh; border-radius: 1vh; border: 1px solid rgba(255,255,255,0.5); opacity: 0; transition: opacity .6s; }
  .badge.on { opacity: 0.9; }
  .badge.gold { color: #ffd47a; border-color: rgba(255,212,122,0.7); }

  /* Stage: cover layout and lyrics layout share the same art + caption. */
  .stage { position: fixed; top: 12vh; bottom: 17vh; left: 5vw; right: 5vw; }
  .hero { position: absolute; top: 50%; left: 50%; width: 52vh; margin: -31vh 0 0 -26vh;
    transition: transform .9s cubic-bezier(.2,.8,.2,1); }
  .art { width: 52vh; height: 52vh; border-radius: 1.6vh; background: rgba(255,255,255,0.08) center/cover no-repeat;
    box-shadow: 0 2.5vh 6vh rgba(0,0,0,0.45); }
  .caption { margin: 3vh -16vh 0; text-align: center; }
  .title { font-size: 4.2vh; font-weight: 700; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { margin-top: 0.8vh; font-size: 2.9vh; opacity: 0.72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .lyrics { position: absolute; top: 0; bottom: 0; left: 46%; right: 0; overflow: hidden; opacity: 0; transition: opacity .6s;
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 22%, #000 70%, transparent 100%); }
  .lines { position: absolute; left: 0; right: 4vw; top: 0; transition: transform .55s cubic-bezier(.2,.8,.2,1); }
  .line { font-size: 5.4vh; font-weight: 700; line-height: 1.22; padding: 1.4vh 0; opacity: 0.32; transition: opacity .4s;
    transform-origin: left center; }
  .line.now { opacity: 1; }
  .line.gap { font-size: 4vh; letter-spacing: .4em; }

  body.with-lyrics .hero { transform: translate(-23vw, 0) scale(0.84); }
  body.with-lyrics .lyrics { opacity: 1; }

  /* Progress */
  .progress { position: fixed; left: 5vw; right: 5vw; bottom: 8.5vh; }
  .bar { height: 0.7vh; border-radius: 0.35vh; background: rgba(255,255,255,0.25); overflow: hidden; }
  .fill { height: 100%; width: 100%; background: rgba(255,255,255,0.9); transform-origin: left center; transform: scaleX(0); }
  .times { display: flex; justify-content: space-between; margin-top: 1.2vh; font-size: 2.2vh; opacity: 0.75; font-variant-numeric: tabular-nums; }

  .next { position: fixed; right: 5vw; bottom: 14vh; padding: 1.2vh 2vh; border-radius: 1.4vh; background: rgba(0,0,0,0.28);
    font-size: 2.2vh; opacity: 0; transform: translate(0, 1.5vh); transition: opacity .5s, transform .5s; max-width: 44vw;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .next.on { opacity: 1; transform: translate(0, 0); }
  .next b { opacity: 0.7; font-weight: 400; margin-right: 1vh; }

  .paused { position: fixed; top: 50%; left: 50%; width: 12vh; height: 12vh; margin: -6vh; border-radius: 50%;
    background: rgba(0,0,0,0.45); opacity: 0; transition: opacity .3s; }
  .paused:before, .paused:after { content: ""; position: absolute; top: 3.5vh; width: 1.6vh; height: 5vh; border-radius: .4vh; background: #fff; }
  .paused:before { left: 4vh; } .paused:after { right: 4vh; }
  body.is-paused .paused { opacity: 1; }
  body.with-lyrics .paused { left: 27vw; }

  .idle { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: center; transition: opacity .8s; background: #0b0b10; }
  .idle .mark { font-size: 9vh; font-weight: 800; letter-spacing: -0.02em; }
  .idle .hint { margin-top: 2vh; font-size: 2.6vh; opacity: 0.6; }
  body.has-media .idle { opacity: 0; }
  .spin { position: fixed; bottom: 8.5vh; left: 50%; width: 3vh; height: 3vh; margin-left: -1.5vh; border-radius: 50%;
    border: .4vh solid rgba(255,255,255,0.25); border-top-color: #fff; opacity: 0; animation: r 1s linear infinite; }
  body.is-buffering .spin { opacity: 1; }
  body.is-buffering .progress { opacity: 0.35; }
  @keyframes r { to { transform: rotate(360deg); } }
  audio { display: none; }
</style>
</head>
<body>
  <div class="bg" id="bg0"><div class="shade"></div></div>
  <div class="bg" id="bg1"><div class="shade"></div></div>

  <div class="brand"><i></i>Aura</div>
  <div class="badge" id="badge"></div>

  <div class="stage">
    <div class="hero">
      <div class="art" id="art"></div>
      <div class="caption"><div class="title" id="title"></div><div class="sub" id="sub"></div></div>
    </div>
    <div class="lyrics"><div class="lines" id="lines"></div></div>
  </div>

  <div class="next" id="next"></div>
  <div class="paused"></div>
  <div class="progress">
    <div class="bar"><div class="fill" id="fill"></div></div>
    <div class="times"><span id="pos">0:00</span><span id="rem">-0:00</span></div>
  </div>
  <div class="spin"></div>

  <div class="idle"><div class="mark">Aura</div><div class="hint" id="hint">Ready to play from your phone</div></div>
  <audio id="audio"></audio>

<script src="https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js"></script>
<script>
(function () {
  var NS = 'urn:x-cast:app.aura';
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;
  var audio = $('audio');
  var state = { lyrics: null, lineIdx: -2, duration: 0, bgFront: 0, palette: null, next: null, contentId: null };

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function setBackground(p) {
    var key = (p || []).join(',');
    if (key && key === state.palette) return;
    state.palette = key;
    var c1 = (p && p[0]) || '#16161d', c2 = (p && p[1]) || '#2a2a35', c3 = (p && p[2]) || c2;
    var next = $('bg' + (1 - state.bgFront));
    next.style.background = 'radial-gradient(ellipse at 22% 18%, ' + c3 + ' 0%, transparent 55%),' +
      'radial-gradient(ellipse at 85% 90%, ' + c2 + ' 0%, transparent 60%),' +
      'linear-gradient(160deg, ' + c2 + ' 0%, ' + c1 + ' 100%)';
    next.className = 'bg on';
    $('bg' + state.bgFront).className = 'bg';
    state.bgFront = 1 - state.bgFront;
  }

  function setLyrics(lines) {
    state.lyrics = lines && lines.length ? lines : null;
    state.lineIdx = -2;
    var box = $('lines');
    if (!state.lyrics) { box.innerHTML = ''; body.classList.remove('with-lyrics'); return; }
    var html = '';
    for (var i = 0; i < state.lyrics.length; i++) {
      var t = state.lyrics[i][1];
      html += t ? '<div class="line">' + esc(t) + '</div>' : '<div class="line gap">• • •</div>';
    }
    box.innerHTML = html;
    box.style.transform = 'translate(0, 30vh)';
    body.classList.add('with-lyrics');
  }

  function syncLyrics(t) {
    var L = state.lyrics;
    if (!L) return;
    var ms = t * 1000 + 250, idx = -1;
    for (var i = 0; i < L.length; i++) { if (L[i][0] <= ms) idx = i; else break; }
    if (idx === state.lineIdx) return;
    var els = $('lines').children;
    if (state.lineIdx >= 0 && els[state.lineIdx]) els[state.lineIdx].className = els[state.lineIdx].className.replace(' now', '');
    state.lineIdx = idx;
    var el = els[Math.max(0, idx)];
    if (idx >= 0 && el) el.className += ' now';
    // Keep the current line about a third of the way down.
    var y = el ? el.offsetTop : 0;
    var h = $('lines').parentNode.clientHeight;
    $('lines').style.transform = 'translate(0, ' + Math.round(h * 0.34 - y) + 'px)';
  }

  function apply(meta, custom) {
    body.classList.add('has-media');
    var img = meta && meta.images && meta.images[0] && meta.images[0].url;
    $('art').style.backgroundImage = img ? 'url("' + img + '")' : 'none';
    $('title').textContent = (meta && meta.title) || '';
    var sub = [meta && meta.artist, meta && meta.albumName].filter(Boolean).join(' — ');
    $('sub').textContent = sub;
    custom = custom || {};
    setBackground(custom.palette);
    var b = $('badge');
    b.textContent = custom.quality || '';
    b.className = 'badge' + (custom.quality ? ' on' : '') + (/HI-RES/i.test(custom.quality || '') ? ' gold' : '');
    setLyrics(custom.lyrics);
    state.next = custom.next || null;
  }

  function onMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.contentId && state.contentId && data.contentId !== state.contentId) return;
    if (data.type === 'lyrics') { setLyrics(data.lyrics); syncLyrics(audio.currentTime || 0); }
    if (data.type === 'next') state.next = data.next || null;
    if (data.type === 'palette') setBackground(data.palette);
  }

  function tick() {
    var d = state.duration || audio.duration || 0, t = audio.currentTime || 0;
    $('fill').style.transform = 'scaleX(' + (d ? Math.min(1, t / d) : 0) + ')';
    $('pos').textContent = fmt(t);
    $('rem').textContent = '-' + fmt(Math.max(0, d - t));
    syncLyrics(t);
    var n = $('next');
    var show = state.next && d && d - t < 20 && d - t > 1;
    if (show && !n.dataset.set) { n.innerHTML = '<b>Up next</b>' + esc(state.next.title + (state.next.artist ? ' · ' + state.next.artist : '')); n.dataset.set = '1'; }
    n.className = 'next' + (show ? ' on' : '');
    if (!show && n.dataset.set && d - t > 20) n.dataset.set = '';
  }
  setInterval(tick, 200);

  /* ───────── Demo (browser preview) ───────── */
  if (/[?&]demo=/.test(location.search)) {
    var lyricsDemo = /lyrics/.test(location.search);
    apply({ title: 'Reality in Motion', artist: 'Tame Impala', albumName: 'Currents',
      images: [{ url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a2a8a"/><stop offset="1" stop-color="#d44a9a"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="58" cy="56" r="12" fill="#ddd"/><path d="M5 5 L58 56" stroke="#ff3d6e" stroke-width="2"/></svg>') }] },
      { palette: ['#2b1638', '#7a4aa0', '#c45fb0'], quality: 'HI-RES 24/96',
        lyrics: lyricsDemo ? [[0, 'I’m edging closer,'], [3000, 'shivers all over'], [6000, ''], [8000, 'It’s way too real, I’m way too sober'], [12000, 'Usually, they’ve got you'], [15000, 'figured out by now']] : null,
        next: { title: 'Let It Happen', artist: 'Tame Impala' } });
    state.duration = 254;
    var fake = 4;
    Object.defineProperty(audio, 'currentTime', { get: function () { return fake; } });
    setInterval(function () { fake += 0.2; if (fake > 254) fake = 0; }, 200);
    return;
  }

  /* ───────── Cast Application Framework ───────── */
  var ctx = cast.framework.CastReceiverContext.getInstance();
  var player = ctx.getPlayerManager();
  player.setMediaElement(audio);

  player.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, function (req) {
    var m = req.media || {};
    state.contentId = m.contentId || m.contentUrl || null;
    state.duration = m.duration || 0;
    apply(m.metadata, m.customData && m.customData.aura ? m.customData : null);
    return req;
  });

  var E = cast.framework.events.EventType;
  player.addEventListener(E.PLAYING, function () { body.classList.remove('is-paused', 'is-buffering'); });
  player.addEventListener(E.PAUSE, function () { body.classList.add('is-paused'); });
  player.addEventListener(E.BUFFERING, function (e) { body.classList.toggle('is-buffering', !!e.isBuffering); });
  player.addEventListener(E.MEDIA_FINISHED, function () { body.classList.remove('is-paused'); });
  player.addEventListener(E.ERROR, function () { $('hint').textContent = 'Couldn’t play that file'; body.classList.remove('has-media'); });
  player.addEventListener(E.LOADED_METADATA, function () { if (!state.duration && audio.duration) state.duration = audio.duration; });

  ctx.addCustomMessageListener(NS, function (e) { onMessage(e.data); });

  var opts = new cast.framework.CastReceiverOptions();
  opts.skipPlayersLoad = true;           // progressive audio only: no Shaka / MPL download
  opts.disableIdleTimeout = false;
  opts.maxInactivity = 3600;
  opts.supportedCommands = cast.framework.messages.Command.ALL_BASIC_MEDIA;
  ctx.start(opts);
})();
</script>
</body>
</html>
`;
