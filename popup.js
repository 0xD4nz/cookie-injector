// Android popup → full tab redirect (popup can't open file picker on Android)
if (/Android/i.test(navigator.userAgent) && !location.search.includes('mode=tab')) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id || '';
    chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?mode=tab&tabId=${tabId}`) });
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Find the target tab
  const params = new URLSearchParams(location.search);
  const savedTabId = params.get('tabId');
  let tab;

  if (savedTabId) {
    // Opened as full tab (Android) — use saved tab ID
    try {
      tab = await chrome.tabs.get(parseInt(savedTabId));
    } catch (_) { }
  }

  if (!tab) {
    // Normal popup mode — use active tab
    const queryTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = queryTabs[0];
  }

  let url = new URL(tab.url);
  document.getElementById('domain-label').innerText = url.hostname;

  // --- REALTIME SITE DETECTION (polling, works on all browsers) ---
  let currentHostname = url.hostname;

  async function checkTabUrl() {
    try {
      const freshTab = await chrome.tabs.get(tab.id);
      if (freshTab.url && freshTab.url.startsWith('http')) {
        const parsed = new URL(freshTab.url);
        if (parsed.hostname !== currentHostname) {
          currentHostname = parsed.hostname;
          tab = freshTab;
          url = parsed;
          document.getElementById('domain-label').innerText = currentHostname;
          cachedCookies = [];
          firstLoad = true;
          loadCookies();
        }
      }
    } catch (_) { }
  }

  setInterval(checkTabUrl, 2000);

  // --- UI NAVIGATION ---
  const tabs = { cookies: document.getElementById('tab-cookies'), spoof: document.getElementById('tab-spoof') };
  const panels = { cookies: document.getElementById('panel-cookies'), spoof: document.getElementById('panel-spoof') };
  const subTabs = { export: document.getElementById('sub-export'), import: document.getElementById('sub-import') };
  const views = { export: document.getElementById('view-export'), import: document.getElementById('view-import') };

  function switchMainTab(target) {
    Object.keys(tabs).forEach(k => {
      tabs[k].classList.remove('active');
      panels[k].classList.remove('active');
    });
    tabs[target].classList.add('active');
    panels[target].classList.add('active');
  }

  function switchSubTab(target) {
    Object.keys(subTabs).forEach(k => subTabs[k].classList.remove('active'));
    Object.values(views).forEach(v => v.style.display = 'none');
    subTabs[target].classList.add('active');
    views[target].style.display = 'block';
  }

  tabs.cookies.onclick = () => switchMainTab('cookies');
  tabs.spoof.onclick = () => switchMainTab('spoof');
  subTabs.export.onclick = () => switchSubTab('export');
  subTabs.import.onclick = () => switchSubTab('import');

  // --- TOAST NOTIFICATION ---
  function setStatus(msg, type = '') {
    const activePanelId = document.querySelector('.panel.active')?.id;
    const slotId = activePanelId === 'panel-spoof' ? 'status-slot-spoof' : 'status-slot-cookies';
    const slot = document.getElementById(slotId);
    if (!slot) return;

    let toast = slot.querySelector('.status-toast');
    if (!toast) {
      toast = document.createElement('div');
      slot.appendChild(toast);
    }

    toast.className = 'status-toast';
    void toast.offsetWidth;
    toast.innerText = msg;
    toast.className = 'status-toast ' + type + ' show';

    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => {
      toast.className = 'status-toast';
    }, 3000);
  }

  // --- COOKIE LOGIC ---
  let cachedCookies = [];
  let firstLoad = true;

  async function loadCookies() {
    try {
      cachedCookies = await chrome.cookies.getAll({ url: tab.url });
      renderExport();
      if (firstLoad) {
        setStatus(`LOADED ${cachedCookies.length} COOKIES`, 'success');
        firstLoad = false;
      }
    } catch (e) {
      setStatus('ERROR LOADING', 'error');
    }
  }

  let activeFormat = 'json';

  function renderExport() {
    const txt = document.getElementById('export-area');
    if (activeFormat === 'json') {
      txt.value = JSON.stringify(cachedCookies, null, 2);
    } else if (activeFormat === 'header') {
      txt.value = cachedCookies.map(c => `${c.name}=${c.value}`).join('; ');
    } else if (activeFormat === 'netscape') {
      txt.value = cachedCookies.map(c => {
        const domain = c.domain.startsWith('.') ? c.domain : '.' + c.domain;
        const flag = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
        return `${domain}\t${flag}\t${c.path}\t${c.secure ? 'TRUE' : 'FALSE'}\t${Math.round(c.expirationDate || 0)}\t${c.name}\t${c.value}`;
      }).join('\n');
    }
  }

  loadCookies();

  // Format link switching
  document.querySelectorAll('.fmt-link').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.fmt-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFormat = btn.dataset.fmt;
      renderExport();
    };
  });

  // Auto-refresh cookies every 2 seconds
  setInterval(() => {
    if (document.getElementById('panel-cookies').classList.contains('active') &&
      document.getElementById('view-export').style.display !== 'none') {
      loadCookies();
    }
  }, 2000);

  // FIX: navigator.clipboard menggantikan execCommand yang deprecated
  document.getElementById('btn-copy').onclick = async () => {
    const text = document.getElementById('export-area').value;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('COPIED!', 'success');
    } catch (e) {
      document.getElementById('export-area').select();
      document.execCommand('copy');
      setStatus('COPIED!', 'success');
    }
  };

  // SAVE TO FILE — use chrome.downloads API, fallback to anchor tag, then close popup
  document.getElementById('btn-save-file').onclick = async () => {
    const text = document.getElementById('export-area').value;
    if (!text) return setStatus('NOTHING TO SAVE', 'error');
    const ext = activeFormat === 'json' ? '.json' : '.txt';
    const mime = activeFormat === 'json' ? 'application/json' : 'text/plain';
    const domain = url.hostname.replace(/\./g, '_');
    const filename = `cookies_${domain}${ext}`;
    const blob = new Blob([text], { type: mime });
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    let saved = false;
    try {
      if (chrome.downloads && chrome.downloads.download) {
        await chrome.downloads.download({ url: dataUrl, filename });
        saved = true;
      }
    } catch (_) { }

    if (!saved) {
      // Fallback: anchor tag download (works on Android & desktop)
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    setStatus('FILE SAVED', 'success');
  };

  // LOAD FROM FILE — input overlays "Load File" text, user taps it directly
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('import-area').value = ev.target.result;
      setStatus(`LOADED: ${file.name}`, 'success');
    };
    reader.onerror = () => setStatus('READ FAILED', 'error');
    reader.readAsText(file);
    fileInput.value = '';
  });

  // FIX: tidak double-call loadCookies + setStatus; clear manual lalu set status sendiri
  document.getElementById('btn-clear').onclick = async () => {
    const cookies = await chrome.cookies.getAll({ url: tab.url });
    for (const c of cookies) {
      const u = 'http' + (c.secure ? 's' : '') + '://' + c.domain.replace(/^\./, '') + c.path;
      await chrome.cookies.remove({ url: u, name: c.name });
    }
    cachedCookies = [];
    renderExport();
    setStatus('CLEARED', 'success');
    // Reload target tab after clearing
    setTimeout(async () => {
      try { await chrome.tabs.reload(tab.id); } catch (_) { }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => location.reload()
        });
      } catch (_) { }
    }, 500);
  };

  // PASTE from clipboard — reliable method for Chrome extension popups
  document.getElementById('btn-paste').onclick = async () => {
    const importArea = document.getElementById('import-area');
    let text = '';

    // Method 1: Hidden textarea + execCommand('paste') — most reliable in extensions
    try {
      const tmp = document.createElement('textarea');
      tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(tmp);
      tmp.focus();
      document.execCommand('paste');
      text = tmp.value;
      document.body.removeChild(tmp);
    } catch (_) { }

    // Method 2: Clipboard API fallback
    if (!text) {
      try {
        text = await navigator.clipboard.readText();
      } catch (_) { }
    }

    if (text) {
      importArea.value = text;
      setStatus('PASTED!', 'success');
    } else {
      setStatus('CLIPBOARD EMPTY', 'error');
    }
  };

  // CLEAR import textarea
  document.getElementById('btn-clear-import').onclick = () => {
    document.getElementById('import-area').value = '';
    setStatus('CLEARED', 'success');
  };

  document.getElementById('btn-inject').onclick = async () => {
    const raw = document.getElementById('import-area').value.trim();
    if (!raw) return setStatus('EMPTY INPUT', 'error');

    let cookies = [];

    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        cookies = JSON.parse(raw);
        if (!Array.isArray(cookies)) cookies = [cookies];
      } catch (e) {
        return setStatus('BAD JSON', 'error');
      }
    } else if (raw.includes('\t') || (raw.split('\n')[0].split(/\s+/).length >= 6 && raw.toUpperCase().includes('FALSE'))) {
      raw.split('\n').forEach(line => {
        if (line.startsWith('#') || !line.trim()) return;
        const parts = line.split(/\t+|\s+/);
        if (parts.length >= 6) {
          cookies.push({
            domain: parts[0],
            path: parts[2],
            secure: parts[3].toUpperCase() === 'TRUE',
            expirationDate: parseFloat(parts[4]),
            name: parts[5],
            value: parts.slice(6).join(' ')
          });
        }
      });
    } else {
      // FIX: split pada '=' pertama saja, agar value yang mengandung '=' tidak terpotong
      raw.split(';').forEach(p => {
        const idx = p.indexOf('=');
        if (idx > 0) {
          cookies.push({
            name: p.slice(0, idx).trim(),
            value: p.slice(idx + 1).trim(),
            domain: url.hostname,
            path: '/'
          });
        }
      });
    }

    if (cookies.length === 0) return setStatus('NO COOKIES FOUND', 'error');

    let count = 0;
    for (const c of cookies) {
      const domain = c.domain || url.hostname;
      let expDate = c.expirationDate;
      if (!expDate || expDate <= 0 || c.session) {
        expDate = (Date.now() / 1000) + 31536000;
      }
      const nc = {
        url: 'http' + (c.secure !== false ? 's' : '') + '://' + domain.replace(/^\./, '') + (c.path || '/'),
        name: c.name,
        value: c.value,
        domain,
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: c.httpOnly === true,
        expirationDate: expDate,
        storeId: c.storeId
      };
      try { await chrome.cookies.set(nc); count++; } catch (e) { }
    }

    setStatus(`INJECTED ${count}`, 'success');
    // Reload target tab — multiple methods for Android compatibility
    setTimeout(async () => {
      try { await chrome.tabs.reload(tab.id); } catch (_) { }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => location.reload()
        });
      } catch (_) { }
    }, 500);
  };

  // --- SPOOFING LOGIC ---
  // FIX: update versi Chrome ke 124
  const UAS = {
    win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  };

  const currentLabel = document.getElementById('current-ua');

  // FIX: restore active button highlight dari storage saat popup dibuka
  chrome.storage.local.get(['activeUA', 'activeUAKey'], (res) => {
    if (res.activeUA) {
      currentLabel.innerText = res.activeUA.length > 30
        ? res.activeUA.substring(0, 30) + '...'
        : res.activeUA;
    }
    if (res.activeUAKey) {
      const btn = document.querySelector(`.ua-btn[data-ua="${res.activeUAKey}"]`);
      if (btn) btn.classList.add('active');
    }
  });

  async function applyUA(uaString, uaKey = null) {
    const RULE_ID = 1;
    document.querySelectorAll('.ua-btn').forEach(b => b.classList.remove('active'));

    if (!uaString) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID] });
      chrome.storage.local.remove(['activeUA', 'activeUAKey']);
      currentLabel.innerText = 'DEFAULT';
      setStatus('UA RESET', 'success');
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [{
          id: RULE_ID, priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'User-Agent', operation: 'set', value: uaString },
              { header: 'sec-ch-ua', operation: 'remove' },
              { header: 'sec-ch-ua-platform', operation: 'remove' },
              { header: 'sec-ch-ua-mobile', operation: 'remove' }  // FIX: tambah header ini
            ]
          },
          condition: {
            urlFilter: '*',
            resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet']
          }
        }]
      });
      chrome.storage.local.set({ activeUA: uaString, activeUAKey: uaKey || 'custom' });
      currentLabel.innerText = uaString.length > 30 ? uaString.substring(0, 30) + '...' : uaString;

      if (uaKey && uaKey !== 'custom') {
        const btn = document.querySelector(`.ua-btn[data-ua="${uaKey}"]`);
        if (btn) btn.classList.add('active');
      }
      setStatus('SPOOF ACTIVE', 'success');
    }
    // Reload tab — use multiple methods for Android compatibility
    try {
      await chrome.tabs.reload(tab.id);
    } catch (_) { }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => location.reload()
      });
    } catch (_) { }
  }

  document.querySelectorAll('.ua-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.ua;
      if (type === 'random') {
        const keys = Object.keys(UAS);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        applyUA(UAS[randomKey], randomKey);
      } else {
        applyUA(UAS[type], type);
      }
    };
  });

  document.getElementById('btn-reset-ua').onclick = () => applyUA(null);

  // CUSTOM UA — FIX: support Enter key
  const customInput = document.getElementById('custom-ua-input');

  function applyCustomUA() {
    const val = customInput.value.trim();
    if (!val) return setStatus('INPUT KOSONG', 'error');
    applyUA(val, 'custom');
    customInput.value = '';
  }

  document.getElementById('btn-apply-custom-ua').onclick = applyCustomUA;
  customInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') applyCustomUA();
  });

});
