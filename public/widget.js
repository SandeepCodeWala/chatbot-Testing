/**
 * ChatBot Embeddable Widget
 *
 * Usage — add to ANY website:
 *
 *   Option 1 (config object):
 *     <script>
 *       window.ChatWidgetConfig = {
 *         serverUrl: 'http://localhost:3000',
 *         app:       'vocuscustomer',
 *         title:     'Customer Support',
 *         subtitle:  'We reply instantly',
 *         theme:     '#2563eb',
 *         position:  'bottom-right',
 *       };
 *     </script>
 *     <script src="http://localhost:3000/widget.js"></script>
 *
 *   Option 2 (data attributes — server URL auto-detected from script src):
 *     <script src="http://localhost:3000/widget.js"
 *             data-app="vocuscustomer"
 *             data-title="Customer Support"
 *             data-theme="#2563eb">
 *     </script>
 */
(function () {
  'use strict';

  if (document.getElementById('cw-root')) return;

  var script = document.currentScript;
  var cfg    = window.ChatWidgetConfig || {};

  var _origin = '';
  try { _origin = script ? new URL(script.src).origin : ''; } catch {}

  var serverUrl = cfg.serverUrl || _origin;
  var app       = cfg.app      || (script && script.dataset.app)      || 'vocuscustomer';
  var title     = cfg.title    || (script && script.dataset.title)    || 'Customer Support';
  var subtitle  = cfg.subtitle || (script && script.dataset.subtitle) || 'Online · We reply instantly';
  var theme     = cfg.theme    || (script && script.dataset.theme)    || '#2563eb';
  var position  = cfg.position || (script && script.dataset.position) || 'bottom-right';
  var initMsg   = cfg.initMsg  || 'Hello! 👋 How can I help you today?';

  var isRight = position !== 'bottom-left';

  // ── Derived colours ─────────────────────────────────────────────────────────
  // Darken theme for gradient (simple: manually create a darker variant)
  function _darken(hex) {
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.max(0,r-40); g = Math.max(0,g-40); b = Math.max(0,b-40);
    return '#' + [r,g,b].map(function(v){return v.toString(16).padStart(2,'0')}).join('');
  }
  var themeDark = _darken(theme);

  // ── Session ──────────────────────────────────────────────────────────────────
  var SESSION_KEY = 'cw_sid_' + app;
  var sessionId   = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'cw_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  var history = [];
  var isOpen  = false;
  var isBusy  = false;

  // ── CSS ──────────────────────────────────────────────────────────────────────
  var S = document.createElement('style');
  S.textContent = '\
#cw-root,#cw-root *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}\
\
/* ── FAB ── */\
#cw-fab{\
  position:fixed;' + (isRight?'right:24px':'left:24px') + ';bottom:24px;\
  width:58px;height:58px;border-radius:50%;\
  background:linear-gradient(135deg,'+theme+','+themeDark+');\
  color:#fff;border:none;cursor:pointer;\
  box-shadow:0 4px 20px '+theme+'55;\
  z-index:2147483646;\
  display:flex;align-items:center;justify-content:center;\
  transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s}\
#cw-fab:hover{transform:scale(1.12);box-shadow:0 8px 28px '+theme+'77}\
#cw-fab.cw-active{transform:rotate(90deg) scale(1.05)}\
#cw-pulse{\
  position:absolute;inset:-4px;\
  border-radius:50%;border:2px solid '+theme+';\
  animation:cw-pulse 2s ease-out infinite;pointer-events:none}\
@keyframes cw-pulse{\
  0%{transform:scale(1);opacity:.6}\
  70%{transform:scale(1.35);opacity:0}\
  100%{transform:scale(1.35);opacity:0}}\
\
/* ── Panel ── */\
#cw-panel{\
  position:fixed;' + (isRight?'right:16px':'left:16px') + ';bottom:96px;\
  width:370px;height:540px;max-height:calc(100vh - 116px);\
  background:#fff;border-radius:20px;overflow:hidden;\
  box-shadow:0 12px 48px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.06);\
  z-index:2147483647;display:flex;flex-direction:column;\
  transform-origin:' + (isRight?'right':'left') + ' bottom;\
  transform:scale(.85) translateY(16px);opacity:0;\
  transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;\
  pointer-events:none}\
#cw-panel.cw-open{\
  transform:scale(1) translateY(0);opacity:1;pointer-events:all}\
\
/* ── Header ── */\
#cw-hdr{\
  background:linear-gradient(135deg,'+theme+' 0%,'+themeDark+' 100%);\
  padding:16px 16px 20px;\
  flex-shrink:0;position:relative;overflow:hidden}\
#cw-hdr::after{\
  content:"";position:absolute;bottom:-12px;left:0;right:0;height:24px;\
  background:#fff;border-radius:50% 50% 0 0 / 100% 100% 0 0}\
.cw-hdr-top{display:flex;align-items:flex-start;gap:11px}\
.cw-av-wrap{position:relative;flex-shrink:0}\
.cw-av-lg{\
  width:42px;height:42px;border-radius:13px;\
  background:rgba(255,255,255,.22);\
  display:flex;align-items:center;justify-content:center;\
  font-weight:800;font-size:15px;color:#fff;\
  border:1.5px solid rgba(255,255,255,.3)}\
.cw-online{\
  position:absolute;bottom:-2px;' + (isRight?'right:-2px':'left:-2px') + ';\
  width:11px;height:11px;border-radius:50%;\
  background:#22c55e;border:2px solid '+theme+'}\
.cw-hdr-info{flex:1;overflow:hidden;padding-top:1px}\
.cw-hdr-title{\
  font-size:15px;font-weight:700;color:#fff;\
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}\
.cw-hdr-sub{font-size:11.5px;color:rgba(255,255,255,.78);margin-top:3px}\
.cw-hdr-close{\
  background:rgba(255,255,255,.18);border:none;color:#fff;\
  width:28px;height:28px;border-radius:8px;cursor:pointer;\
  display:flex;align-items:center;justify-content:center;\
  flex-shrink:0;transition:background .15s;margin-top:-1px}\
.cw-hdr-close:hover{background:rgba(255,255,255,.32)}\
\
/* ── Messages ── */\
#cw-msgs{\
  flex:1;overflow-y:auto;padding:14px 12px 8px;\
  display:flex;flex-direction:column;gap:6px;\
  scroll-behavior:smooth;background:#f8fafd}\
#cw-msgs::-webkit-scrollbar{width:3px}\
#cw-msgs::-webkit-scrollbar-thumb{background:#dde3f0;border-radius:3px}\
.cw-m{display:flex;gap:7px;max-width:85%;animation:cw-in .2s ease}\
@keyframes cw-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}\
.cw-m.u{align-self:flex-end;flex-direction:row-reverse}\
.cw-m.b{align-self:flex-start}\
.cw-av-sm{\
  width:28px;height:28px;border-radius:8px;flex-shrink:0;\
  display:flex;align-items:center;justify-content:center;\
  font-size:10px;font-weight:700;color:#fff;margin-top:2px}\
.cw-m.u .cw-av-sm{background:linear-gradient(135deg,'+theme+','+themeDark+')}\
.cw-m.b .cw-av-sm{background:linear-gradient(135deg,#334155,#0f172a)}\
#cw-root .cw-b{\
  padding:7px 11px;font-size:13px;line-height:1.5;\
  word-break:break-word;max-width:100%}\
#cw-root .cw-b p{margin:0 0 9px}#cw-root .cw-b p:last-child{margin:0}\
#cw-root .cw-b strong{font-weight:700}\
.cw-m.u .cw-b{white-space:pre-wrap}\
.cw-m.u .cw-b{\
  background:linear-gradient(135deg,'+theme+','+themeDark+');\
  color:#fff;border-radius:14px 14px 4px 14px;\
  box-shadow:0 2px 10px '+theme+'44}\
.cw-m.b .cw-b{\
  background:#fff;color:#1e293b;\
  border-radius:14px 14px 14px 4px;\
  border:1px solid #e8edf5;\
  box-shadow:0 1px 6px rgba(0,0,0,.06)}\
\
/* ── Typing indicator ── */\
#cw-typing-row{display:flex;gap:8px;align-self:flex-start;animation:cw-in .2s ease}\
.cw-dots{\
  background:#fff;border:1px solid #e8edf5;\
  border-radius:14px 14px 14px 4px;\
  padding:10px 14px;display:flex;gap:5px;\
  align-items:center;box-shadow:0 1px 6px rgba(0,0,0,.06)}\
.cw-d{\
  width:7px;height:7px;border-radius:50%;\
  background:'+theme+';opacity:.35;animation:cwb 1.2s infinite}\
.cw-d:nth-child(2){animation-delay:.2s}\
.cw-d:nth-child(3){animation-delay:.4s}\
@keyframes cwb{\
  0%,60%,100%{transform:translateY(0);opacity:.35}\
  30%{transform:translateY(-5px);opacity:1}}\
\
/* ── Input bar ── */\
#cw-bar{\
  padding:10px 12px 12px;\
  background:#fff;\
  border-top:1px solid #edf0f7;\
  display:flex;gap:8px;align-items:flex-end;\
  flex-shrink:0}\
#cw-inp{\
  flex:1;border:1.5px solid #e2e8f0;border-radius:12px;\
  padding:9px 13px;font-size:13px;outline:none;\
  transition:border-color .15s,box-shadow .15s;\
  resize:none;min-height:40px;max-height:90px;\
  font-family:inherit;line-height:1.45;color:#1e293b;\
  background:#f8fafd}\
#cw-inp::placeholder{color:#a0aec0}\
#cw-inp:focus{\
  border-color:'+theme+';\
  box-shadow:0 0 0 3px '+theme+'22;\
  background:#fff}\
#cw-send{\
  width:40px;height:40px;border-radius:12px;flex-shrink:0;\
  background:linear-gradient(135deg,'+theme+','+themeDark+');\
  color:#fff;border:none;cursor:pointer;\
  display:flex;align-items:center;justify-content:center;\
  transition:transform .15s,box-shadow .15s;\
  box-shadow:0 2px 8px '+theme+'44}\
#cw-send:hover{transform:scale(1.06);box-shadow:0 4px 14px '+theme+'66}\
#cw-send:disabled{opacity:.4;cursor:default;transform:none;box-shadow:none}\
\
/* ── Branding ── */\
.cw-brand{\
  text-align:center;font-size:10px;color:#b0bac8;\
  padding:0 0 8px;background:#fff;letter-spacing:.2px}\
\
/* ── Mobile ── */\
@media(max-width:420px){\
  #cw-panel{width:calc(100vw - 16px);' + (isRight?'right:8px':'left:8px') + ';bottom:90px}\
  #cw-fab{' + (isRight?'right:14px':'left:14px') + ';bottom:14px}}\
';
  document.head.appendChild(S);

  // ── HTML ─────────────────────────────────────────────────────────────────────
  var root = document.createElement('div');
  root.id  = 'cw-root';

  var initials = title.split(' ').slice(0,2).map(function(w){return w[0];}).join('').toUpperCase() || 'AI';

  // SVG icons
  var ICON_CHAT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  var ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  root.innerHTML =
    '<div id="cw-panel">' +
      '<div id="cw-hdr">' +
        '<div class="cw-hdr-top">' +
          '<div class="cw-av-wrap">' +
            '<div class="cw-av-lg">' + initials + '</div>' +
            '<div class="cw-online"></div>' +
          '</div>' +
          '<div class="cw-hdr-info">' +
            '<div class="cw-hdr-title">' + _esc(title) + '</div>' +
            '<div class="cw-hdr-sub">● ' + _esc(subtitle) + '</div>' +
          '</div>' +
          '<button class="cw-hdr-close" id="cw-close-btn" title="Close">' + ICON_CLOSE + '</button>' +
        '</div>' +
      '</div>' +
      '<div id="cw-msgs"></div>' +
      '<div id="cw-bar">' +
        '<textarea id="cw-inp" placeholder="Type a message…" rows="1"></textarea>' +
        '<button id="cw-send" title="Send">' + ICON_SEND + '</button>' +
      '</div>' +
      '<div class="cw-brand">Powered by Invia ✦</div>' +
    '</div>' +
    '<button id="cw-fab" title="Chat with us">' +
      '<div id="cw-pulse"></div>' +
      ICON_CHAT +
    '</button>';

  document.body.appendChild(root);

  var panel   = document.getElementById('cw-panel');
  var fab     = document.getElementById('cw-fab');
  var msgs    = document.getElementById('cw-msgs');
  var inp     = document.getElementById('cw-inp');
  var sendBtn = document.getElementById('cw-send');

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Render bot messages: markdown → HTML (bold, italic, newlines, bullets)
  function _md(s) {
    var lines = _esc(String(s)).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i]
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')   // **bold**
        .replace(/\*(.+?)\*/g,     '<em>$1</em>')            // *italic*
        .replace(/`(.+?)`/g,       '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>'); // `code`
      // bullet list lines
      if (/^[-•]\s/.test(l)) {
        l = '<span style="display:flex;gap:6px;margin:1px 0"><span style="flex-shrink:0;color:'+theme+'">•</span><span>' + l.replace(/^[-•]\s/, '') + '</span></span>';
      } else if (/^\d+\.\s/.test(l)) {
        var num = l.match(/^(\d+)\./)[1];
        l = '<span style="display:flex;gap:6px;margin:1px 0"><span style="flex-shrink:0;font-weight:700;color:'+theme+'">' + num + '.</span><span>' + l.replace(/^\d+\.\s/, '') + '</span></span>';
      }
      out.push(l);
    }
    // Group into paragraphs (split on blank lines)
    return out.join('\n')
      .split(/\n{2,}/)
      .map(function(block) {
        return '<p>' + block.replace(/\n/g,'<br>') + '</p>';
      })
      .join('');
  }

  function _addMsg(role, text) {
    var div = document.createElement('div');
    div.className = 'cw-m ' + (role === 'user' ? 'u' : 'b');
    var content = role === 'user' ? _esc(text) : _md(text);
    div.innerHTML =
      '<div class="cw-av-sm">' + (role === 'user' ? 'You' : initials) + '</div>' +
      '<div class="cw-b">' + content + '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function _showTyping() {
    var div = document.createElement('div');
    div.id = 'cw-typing-row';
    div.innerHTML =
      '<div class="cw-av-sm" style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#334155,#0f172a);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;margin-top:2px;flex-shrink:0">' + initials + '</div>' +
      '<div class="cw-dots"><div class="cw-d"></div><div class="cw-d"></div><div class="cw-d"></div></div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function _hideTyping() {
    var el = document.getElementById('cw-typing-row');
    if (el) el.remove();
  }

  // ── Toggle ───────────────────────────────────────────────────────────────────
  function _open() {
    isOpen = true;
    panel.classList.add('cw-open');
    fab.classList.add('cw-active');
    fab.querySelector('#cw-pulse').style.display = 'none';
    fab.innerHTML = '<div id="cw-pulse" style="display:none"></div>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    if (msgs.children.length === 0) {
      setTimeout(function() { _addMsg('bot', initMsg); }, 120);
    }
    setTimeout(function () { inp.focus(); }, 280);
  }

  function _close() {
    isOpen = false;
    panel.classList.remove('cw-open');
    fab.classList.remove('cw-active');
    fab.innerHTML =
      '<div id="cw-pulse"></div>' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  }

  fab.addEventListener('click', function () { isOpen ? _close() : _open(); });
  document.getElementById('cw-close-btn').addEventListener('click', _close);

  // ── Send ─────────────────────────────────────────────────────────────────────
  async function _send() {
    var text = inp.value.trim();
    if (!text || isBusy) return;
    inp.value = '';
    inp.style.height = 'auto';
    isBusy = true;
    sendBtn.disabled = true;

    _addMsg('user', text);
    _showTyping();

    try {
      var resp = await fetch(serverUrl + '/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history: history, app: app, sessionId: sessionId }),
      });
      var data = await resp.json();
      _hideTyping();
      _addMsg('bot', data.reply || data.error || 'Sorry, something went wrong.');
      if (data.history) history = data.history;
    } catch (_e) {
      _hideTyping();
      _addMsg('bot', 'Network error — please check your connection.');
    }

    isBusy = false;
    sendBtn.disabled = false;
    inp.focus();
  }

  sendBtn.addEventListener('click', _send);
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
  });
  inp.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 90) + 'px';
  });

})();
