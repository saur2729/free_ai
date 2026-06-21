(function() {
  var init = window.__freeaiInit || {};
  var vscodeApi = window.vscodeApi || acquireVsCodeApi();
  var messages = document.getElementById('messages');
  var modelSelect = document.getElementById('model-select');
  var input = document.getElementById('message-input');
  var btn = document.getElementById('send-btn');
  var configureBanner = document.getElementById('configure-banner');

  if (init.models && modelSelect) {
    modelSelect.innerHTML = init.models.map(function(m) {
      var id = typeof m === 'string' ? m : m.id;
      var name = typeof m === 'string' ? m : m.name;
      return '<option value="' + id + '"' + (id === init.defaultModel ? ' selected' : '') + '>' + name + '</option>';
    }).join('');
  }
  if (configureBanner) configureBanner.hidden = init.hasApiKey !== false;
  if (input) input.disabled = init.hasApiKey === false;
  if (btn) btn.disabled = init.hasApiKey === false;

  function avatarFor(role) { return role === 'user' ? 'U' : role === 'system' ? '!' : 'AI'; }
  function roleLabel(m) {
    if (m.role === 'user') return 'user';
    if (m.role === 'system') return 'system';
    return m.model || (init.currentSession && init.currentSession.model) || 'assistant';
  }

  if (init.currentSession && init.currentSession.messages) {
    init.currentSession.messages.forEach(function(m) {
      var el = document.createElement('div');
      el.className = 'message ' + (m.role || 'assistant');
      renderMsg(el, m);
      messages.appendChild(el);
    });
  }

  if (init.processing) {
    var loadingEl = document.createElement('div');
    loadingEl.className = 'message assistant';
    loadingEl.innerHTML = '<div class="message-body"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    messages.appendChild(loadingEl);
  }
  messages.scrollTop = messages.scrollHeight;

  var resizeHandle = document.getElementById('resize-handle');
  if (resizeHandle && input) {
    var startY, startH;
    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startY = e.clientY;
      startH = input.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    function onMove(e) {
      var dh = startY - e.clientY;
      var nh = Math.max(48, Math.min(startH + dh, window.innerHeight * 0.5));
      input.style.height = nh + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  var slashMenu = document.getElementById('slash-menu');
  var slashItems = document.getElementById('slash-items');
  var slashCmds = [
    { cmd: '/help', desc: 'Show available commands' },
    { cmd: '/clear', desc: 'Clear the current chat' },
    { cmd: '/new', desc: 'Start a new chat' },
    { cmd: '/models', desc: 'Switch AI model' },
    { cmd: '/sessions', desc: 'View chat history' }
  ];
  var slashIdx = 0;
  function updateSlashMenu() {
    if (!input || !slashMenu || !slashItems) return;
    var val = input.value;
    if (val.indexOf('/') === 0) {
      var q = val.slice(1).toLowerCase();
      var filtered = slashCmds.filter(function(c) { return c.cmd.slice(1).indexOf(q) === 0; });
      if (filtered.length > 0) {
        slashMenu.hidden = false;
        slashItems.innerHTML = filtered.map(function(c, i) {
          return '<div class="slash-item' + (i === 0 ? ' active' : '') + '" data-cmd="' + c.cmd + '"><span class="slash-cmd">' + c.cmd + '</span><span class="slash-desc">' + c.desc + '</span></div>';
        }).join('');
        slashIdx = 0;
        return;
      }
    }
    slashMenu.hidden = true;
  }
  if (input) {
    input.addEventListener('input', updateSlashMenu);
    input.addEventListener('keydown', function(e) {
      if (slashMenu && !slashMenu.hidden) {
        var items = slashItems.querySelectorAll('.slash-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (slashIdx < items.length - 1) {
            items[slashIdx].classList.remove('active');
            items[++slashIdx].classList.add('active');
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (slashIdx > 0) {
            items[slashIdx].classList.remove('active');
            items[--slashIdx].classList.add('active');
          }
        }
      }
    });
    slashItems.addEventListener('mousedown', function(e) {
      var item = e.target.closest('.slash-item');
      if (item) {
        e.preventDefault();
        input.value = item.getAttribute('data-cmd');
        slashMenu.hidden = true;
        send();
      }
    });
  }

  function renderMsg(el, m) {
    if (m.role === 'system') {
      el.innerHTML = '<div class="message-header"><div class="message-avatar">!</div><span class="message-role">system</span> <span class="message-body" style="display:inline"></span></div>';
      el.querySelector('.message-body').innerHTML = m.content || '';
    } else {
      el.innerHTML = '<div class="message-header"><div class="message-avatar">' + avatarFor(m.role) + '</div><span class="message-role">' + roleLabel(m) + '</span></div><div class="message-body"></div>';
      el.querySelector('.message-body').innerHTML = renderMarkdown(m.content || '');
    }
  }

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'messageUpdated':
        var all = messages.querySelectorAll('.message');
        var target = all[msg.payload.index];
        if (target) {
          target.querySelector('.message-body').textContent = msg.payload.content;
          target.classList.add('streaming');
        }
        break;
      case 'streamComplete':
        var all2 = messages.querySelectorAll('.message');
        var target2 = all2[msg.payload.index];
        if (target2) { target2.classList.remove('streaming'); }
        if (btn) btn.disabled = false;
        if (input) { input.disabled = false; input.focus(); }
        break;
      case 'error':
        var errEl = document.createElement('div');
        errEl.className = 'message';
        errEl.innerHTML = '<div class="message-body" style="color:var(--vscode-errorForeground,#f14c4c);padding:8px">' + (msg.payload || 'Error') + '</div>';
        messages.appendChild(errEl);
        if (btn) btn.disabled = false;
        if (input) { input.disabled = false; input.focus(); }
        break;
      case 'configured':
        if (configureBanner) configureBanner.hidden = true;
        if (input) input.disabled = false;
        if (btn) btn.disabled = false;
        break;
      case 'init':
        if (msg.payload.models && modelSelect) {
          modelSelect.innerHTML = msg.payload.models.map(function(m) {
            return '<option value="' + m + '"' + (m === msg.payload.defaultModel ? ' selected' : '') + '>' + m + '</option>';
          }).join('');
        }
        if (configureBanner) configureBanner.hidden = msg.payload.hasApiKey !== false;
        if (input) input.disabled = msg.payload.hasApiKey === false;
        if (btn) btn.disabled = msg.payload.hasApiKey === false;
        if (msg.payload.currentSession && msg.payload.currentSession.messages) {
          messages.innerHTML = '';
          msg.payload.currentSession.messages.forEach(function(m) {
            var el = document.createElement('div');
            el.className = 'message ' + (m.role || 'assistant');
            renderMsg(el, m);
            messages.appendChild(el);
          });
        }
        break;
    }
  });

  function addMsg(role, content, isMarkup) {
    var el = document.createElement('div');
    el.className = 'message ' + role;
    el.innerHTML = '<div class="message-header"><div class="message-avatar">' + avatarFor(role) + '</div><span class="message-role">' + role + '</span></div><div class="message-body"></div>';
    if (isMarkup) {
      el.querySelector('.message-body').innerHTML = content;
    } else {
      el.querySelector('.message-body').textContent = content || '';
    }
    messages.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function runCommand(cmd) {
    switch (cmd) {
      case '/clear':
        messages.innerHTML = '';
        window.vscodeApi.postMessage({ type: 'clearChat' });
        return true;
      case '/help':
        addMsg('assistant', 'Available commands:<br>- <b>/help</b> — Show this message<br>- <b>/clear</b> — Clear the current chat<br>- <b>/new</b> — Start a new chat<br>- <b>/models</b> — Select model<br>- <b>/sessions</b> — View chat history', true);
        return true;
      case '/new':
        window.vscodeApi.postMessage({ type: 'newSession' });
        return true;
      case '/models':
        renderModelPicker();
        return true;
      case '/sessions':
        showSessionModal();
        return true;
    }
    return false;
  }

  var modelModalActive = false;
  var modelModalIdx = 0;
  document.addEventListener('keydown', function(e) {
    if (!modelModalActive) return;
    var modal = document.getElementById('model-modal');
    var list = document.getElementById('model-list');
    if (!modal || modal.hidden) { modelModalActive = false; return; }
    var items = list ? list.querySelectorAll('.model-item') : [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (modelModalIdx < items.length - 1) modelModalIdx++;
      items.forEach(function(el, i) { el.classList.toggle('active', i === modelModalIdx); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (modelModalIdx > 0) modelModalIdx--;
      items.forEach(function(el, i) { el.classList.toggle('active', i === modelModalIdx); });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var models = init.models || [];
      if (modelModalIdx >= 0 && modelModalIdx < models.length && modelSelect) {
        var id = typeof models[modelModalIdx] === 'string' ? models[modelModalIdx] : models[modelModalIdx].id;
        modelSelect.value = id;
      }
      modal.hidden = true;
      modelModalActive = false;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      modal.hidden = true;
      modelModalActive = false;
    }
  });

  function renderModelPicker() {
    try {
      var models = (init && init.models) || [];
      if (!models.length) { addMsg('assistant', 'No models available.'); return; }
      var current = modelSelect ? modelSelect.value : (init.defaultModel || '');
      var overlay = document.createElement('div');
      overlay.id = 'model-picker-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;outline:none';
      overlay.tabIndex = -1;
      var backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5)';
      backdrop.addEventListener('click', function() { overlay.remove(); });
      overlay.appendChild(backdrop);
      var content = document.createElement('div');
      content.style.cssText = 'position:relative;background:var(--chat-header-bg);border:1px solid var(--chat-border);border-radius:var(--chat-radius,8px);width:90%;max-width:360px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)';
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--chat-border)';
      var headerTitle = document.createElement('div');
      headerTitle.innerHTML = '<h3 style="margin:0;font-size:14px;font-weight:600">Select Model</h3>';
      header.appendChild(headerTitle);
      var closeBtn = document.createElement('button');
      closeBtn.textContent = 'x';
      closeBtn.style.cssText = 'background:none;border:none;color:var(--chat-text);font-size:20px;cursor:pointer;opacity:0.6;padding:0 4px';
      closeBtn.addEventListener('click', function() { overlay.remove(); });
      header.appendChild(closeBtn);
      content.appendChild(header);
      var body = document.createElement('div');
      body.style.cssText = 'padding:8px;overflow-y:auto;flex:1';
      var items = [];
      var groups = {};
      models.forEach(function(m) {
        var p = m.provider || 'default';
        if (!groups[p]) groups[p] = [];
        groups[p].push(m);
      });
      var providerColors = {};
      function getProviderColor(p) {
        if (!providerColors[p]) {
          var hue = (Object.keys(providerColors).length * 60 + 200) % 360;
          providerColors[p] = 'hsl(' + hue + ', 50%, 55%)';
        }
        return providerColors[p];
      }
      var pickerStyle = document.createElement('style');
      pickerStyle.textContent = '.mp-item{cursor:pointer;border-radius:4px;margin:1px 0}.mp-item .mp-name{transition:all 0.1s}.mp-item:hover .mp-name{padding-left:4px;font-weight:600}';
      content.appendChild(pickerStyle);
      Object.keys(groups).forEach(function(p) {
        var group = groups[p];
        var color = getProviderColor(p);
        var groupHeader = document.createElement('div');
        groupHeader.style.cssText = 'padding:6px 8px 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:' + color + ';border-bottom:1px solid ' + color + '30;margin-top:4px';
        groupHeader.textContent = p;
        body.appendChild(groupHeader);
        group.forEach(function(m) {
          var item = document.createElement('div');
          var isCurrent = m.id === current;
          item.className = 'mp-item';
          item.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 8px 5px 18px';
          item.innerHTML = '<span class="mp-arrow" style="color:' + color + '">' + (isCurrent ? '>>  ' : '') + '</span><span class="mp-name" style="font-weight:' + (isCurrent ? '700' : '400') + ';font-size:13px">' + (m.name || m.id) + '</span>';
          item.addEventListener('mouseenter', function() {
            var arrow = item.querySelector('.mp-arrow');
            if (arrow) arrow.innerHTML = '>>  ';
            var name = item.querySelector('.mp-name');
            if (name) name.style.fontWeight = '600';
            var prev = items[idx];
            if (prev && prev !== item) {
              var pa = prev.querySelector('.mp-arrow');
              if (pa && pa.innerHTML) pa.innerHTML = '';
            }
          });
          item.addEventListener('mouseleave', function() {
            var itemIdx = items.indexOf(item);
            if (itemIdx !== idx) {
              var arrow = item.querySelector('.mp-arrow');
              if (arrow) arrow.innerHTML = '';
              var name = item.querySelector('.mp-name');
              if (name) name.style.fontWeight = '400';
            } else {
              var arrow = item.querySelector('.mp-arrow');
              if (arrow && !arrow.innerHTML) arrow.innerHTML = '>>  ';
              var name = item.querySelector('.mp-name');
              if (name) name.style.fontWeight = '700';
            }
          });
          (function(modelId) {
            item.addEventListener('click', function() {
              selectModelFromPicker(modelId);
            });
          })(m.id);
          body.appendChild(item);
          items.push(item);
        });
      });
      content.appendChild(body);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
      var idx = Math.max(0, models.findIndex(function(m) { return m.id === current; }));
      function highlight(i) {
        items.forEach(function(el, j) {
          var arrow = el.querySelector('.mp-arrow');
          if (arrow) arrow.innerHTML = j === i ? '>>  ' : '';
          var name = el.querySelector('.mp-name');
          if (name) name.style.fontWeight = j === i ? '700' : '400';
        });
        if (items[i]) items[i].scrollIntoView({ block: 'nearest' });
      }
      function selectModelFromPicker(modelId) {
        if (modelSelect) modelSelect.value = modelId;
        vscodeApi.postMessage({ type: 'selectModel', payload: { modelId: modelId } });
        overlay.remove();
      }
      function cleanup() { overlay.remove(); }
      function moveHighlight(i) { idx = i; highlight(idx); }
      overlay.addEventListener('wheel', function(e) {
        if (e.deltaY > 0) moveHighlight(idx + 1 >= items.length ? 0 : idx + 1);
        else moveHighlight(idx - 1 < 0 ? items.length - 1 : idx - 1);
        e.preventDefault();
      }, { passive: false });
      overlay.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(idx + 1 >= items.length ? 0 : idx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(idx - 1 < 0 ? items.length - 1 : idx - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); selectModelFromPicker(models[idx].id); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
      });
      setTimeout(function() { overlay.focus(); }, 10);
    } catch(e) { addMsg('assistant', 'Error: ' + e.message); }
  }

  var _sessionModalHandler = null;
  function showSessionModal() {
    var modal = document.getElementById('session-modal');
    var list = document.getElementById('session-list');
    if (!modal || !list) return;
    var sessions = (init.sessions || []).slice().sort(function(a, b) { return b.updatedAt - a.updatedAt; });
    list.innerHTML = '';
    function renderItems(items) {
      list.innerHTML = '';
      items.forEach(function(s) {
        var item = document.createElement('div');
        item.className = 'session-item';
        var title = s.title || 'New Chat';
        item.innerHTML = '<div class="session-item-info"><div class="session-item-title">' + title.replace(/</g, '&lt;') + '</div><div class="session-item-meta">' + s.messageCount + ' msgs &middot; ' + s.model + '</div></div>';
        item.addEventListener('click', function() {
          modal.hidden = true;
          window.vscodeApi.postMessage({ type: 'loadSession', payload: { sessionId: s.id } });
        });
        list.appendChild(item);
      });
    }
    renderItems(sessions);
    renderSessionSearch(sessions, list, renderItems);
    if (_sessionModalHandler) document.removeEventListener('keydown', _sessionModalHandler);
    _sessionModalHandler = function(e) {
      if (modal.hidden) { document.removeEventListener('keydown', _sessionModalHandler); _sessionModalHandler = null; return; }
      if (e.key === 'Escape') { modal.hidden = true; return; }
      var items = list.querySelectorAll('.session-item');
      var active = list.querySelector('.session-item.active');
      var idx = active ? Array.prototype.indexOf.call(items, active) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        var next = idx + 1 < items.length ? idx + 1 : 0;
        if (items[next]) items[next].classList.add('active');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        var prev = idx - 1 >= 0 ? idx - 1 : items.length - 1;
        if (items[prev]) items[prev].classList.add('active');
      } else if (e.key === 'Enter') {
        var target = active || items[0];
        if (target) { e.preventDefault(); target.click(); }
      }
    };
    setTimeout(function() { document.addEventListener('keydown', _sessionModalHandler); }, 0);
    modal.hidden = false;
  }

  function renderSessionSearch(sessions, listEl, renderItems) {
    var search = document.getElementById('session-search');
    if (!search) return;
    search.value = '';
    search.oninput = function() {
      var q = search.value.toLowerCase();
      var filtered = sessions.filter(function(s) { return (s.title || '').toLowerCase().indexOf(q) !== -1; });
      renderItems(filtered);
    };
  }

  var _queueTexts = null;
  var _queueCount = 0;
  function send() {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    slashMenu.hidden = true;
    if (text[0] === '/') {
      if (runCommand(text)) return;
      addMsg('system', '<span style="color:#f14c4c">unknown command: <b>' + text.replace(/</g, '&lt;') + '</b></span>', true);
      return;
    }
    var model = modelSelect ? modelSelect.value : '';
    if (!model) model = init.defaultModel || 'deepseek-v4-flash-free';
    if (_queueTexts) {
      _queueTexts.push(text);
      _queueCount++;
      var qe = document.getElementById('queue-msgs');
      if (qe) qe.textContent = _queueCount + ' msg' + (_queueCount > 1 ? 's' : '') + ' queued';
      messages.scrollTop = messages.scrollHeight;
      window.vscodeApi.postMessage({ type: 'sendMessage', payload: { content: text, model: model } });
      return;
    }
    var hasLoading = messages.querySelector('.message.assistant:last-child .loading-dots');
    if (hasLoading || init.processing) {
      _queueTexts = [text];
      _queueCount = 1;
      var el = document.createElement('div');
      el.id = 'queue-msgs';
      el.style.cssText = 'text-align:center;padding:6px 12px;font-size:12px;color:#888;';
      el.textContent = '1 msg queued';
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      window.vscodeApi.postMessage({ type: 'sendMessage', payload: { content: text, model: model } });
      return;
    }
    addMsg('user', text);
    addMsg('assistant', '<div class="loading-dots"><span></span><span></span><span></span></div>', true);
    var lastMsg = messages.lastElementChild;
    if (lastMsg) { var lr = lastMsg.querySelector('.message-role'); if (lr) lr.textContent = model; }
    window.vscodeApi.postMessage({ type: 'sendMessage', payload: { content: text, model: model } });
  }
  if (btn) btn.addEventListener('click', send);
  if (input) input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && slashMenu && !slashMenu.hidden) {
      slashMenu.hidden = true;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (slashMenu && !slashMenu.hidden) {
        var active = slashItems.querySelector('.slash-item.active');
        if (active) {
          input.value = active.getAttribute('data-cmd');
          slashMenu.hidden = true;
          send();
          return;
        }
      }
      e.preventDefault();
      send();
    }
  });
  if (modelSelect) modelSelect.addEventListener('change', function() {
    vscodeApi.postMessage({ type: 'selectModel', payload: { modelId: modelSelect.value } });
  });
  document.querySelectorAll('.hint-btn').forEach(function(b) {
    b.addEventListener('click', function() { if (input) { input.value = b.getAttribute('data-cmd'); send(); } });
  });
  document.querySelectorAll('.modal-backdrop, .modal-close').forEach(function(b) {
    b.addEventListener('click', function() {
      var m = b.closest('.modal');
      if (m) { m.hidden = true; modelModalActive = false; }
    });
  });
  var cfgBtn = document.getElementById('configure-btn');
  if (cfgBtn) cfgBtn.addEventListener('click', function() { window.vscodeApi.postMessage({ type: 'configure' }); });
  var newSessBtn = document.getElementById('new-session-btn');
  if (newSessBtn) newSessBtn.addEventListener('click', function() {
    document.getElementById('session-modal').hidden = true;
    window.vscodeApi.postMessage({ type: 'newSession' });
  });
  var sessBtn = document.getElementById('session-btn');
  if (sessBtn) sessBtn.addEventListener('click', showSessionModal);
  var clearBtn = document.getElementById('clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function() {
    messages.innerHTML = '';
    window.vscodeApi.postMessage({ type: 'clearChat' });
  });
  if (input) input.focus();
})();
