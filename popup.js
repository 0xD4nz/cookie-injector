document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  document.getElementById('domain-label').innerText = url.hostname;

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

  // SAVE TO FILE
  document.getElementById('btn-save-file').onclick = () => {
    const text = document.getElementById('export-area').value;
    if (!text) return setStatus('NOTHING TO SAVE', 'error');
    const ext = activeFormat === 'json' ? '.json' : '.txt';
    const mime = activeFormat === 'json' ? 'application/json' : 'text/plain';
    const domain = url.hostname.replace(/\./g, '_');
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cookies_${domain}${ext}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 200);
    setStatus('FILE SAVED', 'success');
  };

  // LOAD FROM FILE
  const fileInput = document.getElementById('file-input');
  document.getElementById('btn-load-file').onclick = () => {
    fileInput.value = '';
    fileInput.click();
  };
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
  };

  // PASTE from clipboard into import textarea
  document.getElementById('btn-paste').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return setStatus('CLIPBOARD EMPTY', 'error');
      document.getElementById('import-area').value = text;
      setStatus('PASTED!', 'success');
    } catch (e) {
      setStatus('PASTE FAILED', 'error');
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
    // Double reload: satu untuk PC, satu untuk Android browser (Lemur/Kiwi)
    setTimeout(() => {
      chrome.tabs.update(tab.id, { url: tab.url });
      chrome.tabs.reload(tab.id);
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
    chrome.tabs.reload(tab.id);
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
