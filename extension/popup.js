// ── State ────────────────────────────────────────────────────────────────────
let calcResults  = null;
let marketPrices = null;
let userData     = null;   // { email, me, farms, zones, herds, tasks }

// ── Crop presets (USD values) ─────────────────────────────────────────────────
const CROPS = {
  wheat:     { label: 'Wheat / Пшеница',       seeds: 50,  fert: 120, pest: 40,  labor: 80,  equip: 100, irrig: 60,  land: 150, yieldHa: 3.5,  priceKey: 'wheat'     },
  corn:      { label: 'Corn / Кукуруза',        seeds: 80,  fert: 150, pest: 60,  labor: 90,  equip: 120, irrig: 80,  land: 150, yieldHa: 7.0,  priceKey: 'corn'      },
  soybean:   { label: 'Soybean / Соя',          seeds: 70,  fert: 100, pest: 50,  labor: 80,  equip: 110, irrig: 60,  land: 150, yieldHa: 2.5,  priceKey: 'soybean'   },
  cotton:    { label: 'Cotton / Хлопок',        seeds: 90,  fert: 140, pest: 100, labor: 200, equip: 150, irrig: 120, land: 150, yieldHa: 1.5,  priceKey: 'cotton'    },
  rice:      { label: 'Rice / Рис',             seeds: 60,  fert: 130, pest: 50,  labor: 200, equip: 130, irrig: 200, land: 150, yieldHa: 4.5,  priceKey: 'rice'      },
  sunflower: { label: 'Sunflower / Подсолнух',  seeds: 60,  fert: 110, pest: 40,  labor: 70,  equip: 100, irrig: 40,  land: 150, yieldHa: 2.0,  priceKey: 'sunflower' },
  barley:    { label: 'Barley / Ячмень',        seeds: 50,  fert: 100, pest: 30,  labor: 70,  equip: 90,  irrig: 40,  land: 150, yieldHa: 3.0,  priceKey: 'barley'    },
  potato:    { label: 'Potato / Картофель',     seeds: 400, fert: 200, pest: 150, labor: 300, equip: 200, irrig: 100, land: 150, yieldHa: 25.0, priceKey: 'potato'    },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function el(id)    { return document.getElementById(id); }
function qsa(sel)  { return document.querySelectorAll(sel); }

function fmtUSD(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Init ─────────────────────────────────────────────────────────────────────
const SITE_URL = 'https://cursor-farm-1.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCalculator();
  initPrices();
  initExport();

  // Show login gate while we check auth, then reveal main UI
  showLoginGate();
  checkAuth();

  // React to logout even while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('farm_user' in changes)) return;
    const newVal = changes.farm_user.newValue;
    if (!newVal) {
      // Token was cleared → go back to login gate
      userData = null;
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      showLoginGate();
    } else if (!userData && (newVal.token || newVal.email)) {
      // Logged in from another tab while popup was open on login gate
      onLoggedIn(newVal);
    }
  });
});

// ── Auth gate ─────────────────────────────────────────────────────────────────
function showLoginGate() {
  el('login-gate').style.display    = 'block';
  el('main-tabs').style.display     = 'none';
  el('main-content').style.display  = 'none';

  el('btn-open-site').addEventListener('click', () => {
    chrome.tabs.create({ url: SITE_URL + '/login' });
  });
}

function showMainUI() {
  el('login-gate').style.display    = 'none';
  el('main-tabs').style.display     = 'flex';
  el('main-content').style.display  = 'block';
}

let _pollTimer = null;

function checkAuth(attempt = 0) {
  chrome.runtime.sendMessage({ type: 'GET_USER_DATA' }, (data) => {
    if (chrome.runtime.lastError) {
      if (attempt < 4) setTimeout(() => checkAuth(attempt + 1), 600);
      return;
    }

    if (data && (data.token || data.email)) {
      onLoggedIn(data);
      return;
    }

    // Not in storage yet — try reading directly from the active tab
    tryReadTokenFromTab(() => {
      const hint = el('gate-checking');
      if (hint) hint.textContent = 'Войдите на сайте — расширение обновится автоматически.';

      if (!_pollTimer) {
        _pollTimer = setInterval(() => {
          chrome.runtime.sendMessage({ type: 'GET_USER_DATA' }, (d) => {
            if (chrome.runtime.lastError || !d) {
              tryReadTokenFromTab();
              return;
            }
            if (d.token || d.email) {
              clearInterval(_pollTimer);
              _pollTimer = null;
              onLoggedIn(d);
            }
          });
        }, 1500);
      }
    });
  });
}

// Read farm_token from the active tab — tries scripting API first, falls back to tab message
function tryReadTokenFromTab(onNotFound) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id || !tab.url) { onNotFound?.(); return; }

    const isFarmTab = tab.url.includes('cursor-farm') || tab.url.includes('localhost');
    if (!isFarmTab) { onNotFound?.(); return; }

    function handleToken(token) {
      if (token) {
        const origin = new URL(tab.url).origin;
        chrome.runtime.sendMessage({ type: 'SYNC_TOKEN', token, apiOrigin: origin });
        onLoggedIn({ token, email: null });
      } else {
        onNotFound?.();
      }
    }

    // Method 1: chrome.scripting (requires scripting permission + full reload)
    if (chrome.scripting?.executeScript) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, func: () => localStorage.getItem('farm_token') },
        (results) => {
          if (chrome.runtime.lastError) {
            tryViaContentScript(tab.id, handleToken, onNotFound);
            return;
          }
          handleToken(results?.[0]?.result);
        }
      );
      return;
    }

    // Method 2: ask the content script already running on the page
    tryViaContentScript(tab.id, handleToken, onNotFound);
  });
}

function tryViaContentScript(tabId, onToken, onNotFound) {
  chrome.tabs.sendMessage(tabId, { type: 'GET_TOKEN' }, (resp) => {
    if (chrome.runtime.lastError || !resp) { onNotFound?.(); return; }
    onToken(resp.token);
  });
}

function onLoggedIn(data) {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  userData = data;
  renderUserInfo(data);
  showMainUI();
  loadUserData();
  // Re-fetch full user data shortly after (background may still be fetching)
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'GET_USER_DATA' }, (d) => {
      if (d && (d.email || d.farms)) {
        userData = d;
        renderUserInfo(d);
      }
    });
  }, 2500);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function initTabs() {
  qsa('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      qsa('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab}`));
      if (tab === 'export') fetchAnalyticsForExport(false);
    });
  });
}

// ── Calculator ────────────────────────────────────────────────────────────────
function initCalculator() {
  const cropSel = el('calc-crop');

  // Populate crop options
  for (const [key, crop] of Object.entries(CROPS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = crop.label;
    cropSel.appendChild(opt);
  }

  // When crop changes → fill presets
  cropSel.addEventListener('change', () => applyPreset(cropSel.value));
  applyPreset(cropSel.value);

  el('btn-calculate').addEventListener('click', runCalculation);

  // "Live" button → copy market price for current crop
  el('btn-use-market-price').addEventListener('click', () => {
    if (!marketPrices) return;
    const key = el('calc-crop').value;
    const p = marketPrices[key];
    if (p) el('calc-price').value = p.price;
  });
}

function applyPreset(cropKey) {
  const c = CROPS[cropKey];
  if (!c) return;
  el('calc-seeds').value     = c.seeds;
  el('calc-fertilizer').value = c.fert;
  el('calc-pesticide').value  = c.pest;
  el('calc-labor').value      = c.labor;
  el('calc-equipment').value  = c.equip;
  el('calc-irrigation').value = c.irrig;
  el('calc-land').value       = c.land;
  el('calc-yield').value      = c.yieldHa;

  // Auto-fill price from cached market data
  if (marketPrices && marketPrices[cropKey]) {
    el('calc-price').value = marketPrices[cropKey].price;
  } else {
    el('calc-price').value = '';
  }
}

function num(id) { return parseFloat(el(id).value) || 0; }

function runCalculation() {
  const area    = num('calc-area');
  if (area <= 0) { showCalcError('Enter a valid area (ha).'); return; }

  const costPerHa = num('calc-seeds') + num('calc-fertilizer') + num('calc-pesticide')
                  + num('calc-labor') + num('calc-equipment')  + num('calc-irrigation')
                  + num('calc-land');
  const totalCost   = costPerHa * area;
  const yieldHa     = num('calc-yield');
  const price       = num('calc-price');
  const totalYield  = yieldHa * area;
  const revenue     = totalYield * price;
  const profit      = revenue - totalCost;
  const breakEven   = yieldHa > 0 ? costPerHa / yieldHa : 0;
  const cropKey     = el('calc-crop').value;

  calcResults = {
    crop: CROPS[cropKey]?.label || cropKey,
    area, costPerHa, totalCost,
    yieldHa, totalYield, price, revenue, profit, breakEven,
    date: Date.now(),
  };

  renderResults(calcResults);
}

function showCalcError(msg) {
  const r = el('calc-results');
  r.innerHTML = `<div style="color:#dc2626;font-size:12px;margin-top:10px;padding:8px;background:#fef2f2;border-radius:6px;">${msg}</div>`;
  r.style.display = 'block';
}

function renderResults(r) {
  const isProfit = r.profit >= 0;
  el('calc-results').innerHTML = `
    <div class="results-card">
      <div class="result-row">
        <span class="result-label">Total cost / Итого затрат</span>
        <span class="result-value">${fmtUSD(r.totalCost)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Cost per ha / На 1 га</span>
        <span class="result-value">${fmtUSD(r.costPerHa)}/ha</span>
      </div>
      <div class="result-row">
        <span class="result-label">Expected yield / Урожай</span>
        <span class="result-value">${r.totalYield.toFixed(1)} t</span>
      </div>
      <div class="result-row">
        <span class="result-label">Revenue / Выручка</span>
        <span class="result-value">${fmtUSD(r.revenue)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Net profit/loss / Прибыль</span>
        <span class="result-value ${isProfit ? 'profit' : 'loss'}">${isProfit ? '+' : ''}${fmtUSD(r.profit)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Break-even price / Безубыток</span>
        <span class="result-value">${fmtUSD(r.breakEven)}/t</span>
      </div>
    </div>`;
  el('calc-results').style.display = 'block';
}

// ── Market prices ─────────────────────────────────────────────────────────────
function initPrices() {
  fetchPrices('GET_PRICES');
  el('btn-refresh-prices').addEventListener('click', () => fetchPrices('REFRESH_PRICES'));
}

function fetchPrices(msgType, retries = 2) {
  const btn = el('btn-refresh-prices');
  if (msgType === 'REFRESH_PRICES') {
    btn.textContent = '…';
    btn.disabled = true;
  }

  chrome.runtime.sendMessage({ type: msgType }, (prices) => {
    btn.textContent = '↻ Refresh';
    btn.disabled = false;

    if (chrome.runtime.lastError || !prices) {
      if (retries > 0) {
        setTimeout(() => fetchPrices(msgType, retries - 1), 600);
      } else {
        el('prices-table-body').innerHTML =
          '<tr><td colspan="4" class="loading-cell">⚠ Could not load prices.</td></tr>';
      }
      return;
    }

    marketPrices = prices;
    renderPriceTable(prices);

    // Sync price to calculator if that crop is selected
    const cropKey = el('calc-crop').value;
    if (cropKey && prices[cropKey]) el('calc-price').value = prices[cropKey].price;
  });
}

function renderPriceTable(prices) {
  const entries = Object.entries(prices);
  if (!entries.length) return;

  const updated = entries[0][1].updated;
  el('last-updated').textContent = updated ? `Updated ${timeAgo(updated)}` : '';

  const rows = entries.map(([key, p]) => {
    const up = p.change >= 0;
    const arrow = up ? '▲' : '▼';
    const cls   = up ? 'change-up' : 'change-down';
    return `<tr>
      <td><strong>${p.name}</strong></td>
      <td><strong>$${p.price}</strong><span style="color:#9ca3af;font-size:10px;">/${p.unit}</span></td>
      <td class="${cls}">${arrow} ${Math.abs(p.change).toFixed(2)}%</td>
      <td><button class="use-price-btn" data-crop="${key}" data-price="${p.price}">Use</button></td>
    </tr>`;
  }).join('');

  el('prices-table-body').innerHTML = rows;

  // "Use" buttons → copy to calculator and switch tab
  qsa('.use-price-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cropKey = btn.dataset.crop;
      el('calc-crop').value = cropKey;
      applyPreset(cropKey);
      el('calc-price').value = btn.dataset.price;

      // Switch to calculator tab
      qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'calculator'));
      qsa('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-calculator'));
    });
  });
}

// ── User data ─────────────────────────────────────────────────────────────────
function loadUserData(retries = 2) {
  chrome.runtime.sendMessage({ type: 'GET_USER_DATA' }, (data) => {
    if (chrome.runtime.lastError || !data) {
      if (retries > 0) setTimeout(() => loadUserData(retries - 1), 600);
      return;
    }
    userData = data;
    renderUserInfo(data);
  });
}

function renderUserInfo(data) {
  if (!data) return;

  // Header: show email
  const email = data.email || data.me?.email;
  if (email) {
    el('header-user').textContent = email;
  }

  // Header badge: show farm name
  const farmName = data.farms?.[0]?.name;
  if (farmName) {
    const badge = el('header-farm-badge');
    badge.textContent = '🌾 ' + farmName;
    badge.style.display = 'block';
  }
}

// ── Export ────────────────────────────────────────────────────────────────────
let analyticsCache = null;

function initExport() {
  el('btn-export-excel').addEventListener('click', handleExcelExport);
  el('btn-export-pdf').addEventListener('click', handlePdfExport);
  el('btn-reload-analytics').addEventListener('click', () => fetchAnalyticsForExport(true));
}

function setAnalyticsStatus(state) {
  const s = el('ai-analytics-status');
  if (!s) return;
  if (state === 'loading') {
    s.style.color = '#9ca3af';
    s.textContent = '⏳ Loading from server…';
  } else if (state === 'ok') {
    s.style.color = '#16a34a';
    s.textContent = '✓ AI analytics ready — will be included in export';
  } else if (state === 'noauth') {
    s.style.color = '#d97706';
    s.textContent = '⚠ Not logged in — log in on the site first';
  } else {
    s.style.color = '#dc2626';
    s.textContent = '✗ Could not load — check login or tap ↻ Load';
  }
}

function fetchAnalyticsForExport(force) {
  // Use in-memory cache unless forced
  if (!force && analyticsCache) {
    setAnalyticsStatus('ok');
    return;
  }
  // Use userData.analytics if already populated
  if (!force && userData?.analytics) {
    analyticsCache = userData.analytics;
    setAnalyticsStatus('ok');
    return;
  }

  setAnalyticsStatus('loading');
  el('btn-reload-analytics').disabled = true;

  chrome.runtime.sendMessage({ type: 'GET_ANALYTICS' }, (analytics) => {
    el('btn-reload-analytics').disabled = false;
    if (chrome.runtime.lastError) {
      setAnalyticsStatus('error');
      return;
    }
    if (!analytics) {
      // Check if we even have a token
      chrome.runtime.sendMessage({ type: 'GET_USER_DATA' }, (u) => {
        setAnalyticsStatus(u?.token ? 'error' : 'noauth');
      });
      return;
    }
    analyticsCache = analytics;
    if (userData) userData.analytics = analytics;
    setAnalyticsStatus('ok');
  });
}

function getExportPayload() {
  const wantCalc     = el('export-include-calc').checked;
  const wantPrices   = el('export-include-prices').checked;
  const hasCalc      = wantCalc && calcResults != null;
  const hasPrices    = wantPrices && marketPrices != null;
  const analytics    = analyticsCache ?? userData?.analytics ?? null;

  return {
    hasCalc, hasPrices,
    calculator: calcResults,
    prices: marketPrices,
    analytics,
    ready: hasCalc || hasPrices,
  };
}

function showExportError(msg) {
  const e = el('export-error');
  e.textContent = msg;
  e.style.display = 'block';
  setTimeout(() => { e.style.display = 'none'; }, 4000);
}

function handleExcelExport() {
  const d = getExportPayload();
  if (!d.ready) {
    showExportError('Run the calculator and/or load market prices first.');
    return;
  }
  runExportWithAnalytics(d, exportAsExcel, el('btn-export-excel'));
}

function handlePdfExport() {
  const d = getExportPayload();
  if (!d.ready) {
    showExportError('Run the calculator and/or load market prices first.');
    return;
  }
  runExportWithAnalytics(d, exportAsPDF, el('btn-export-pdf'));
}

function runExportWithAnalytics(d, exportFn, btn) {
  if (d.analytics) {
    exportFn(d);
    return;
  }

  // Analytics not ready yet — fetch now then export
  const origText = btn.textContent;
  btn.textContent = '⏳ AI…';
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: 'GET_ANALYTICS' }, (analytics) => {
    btn.textContent = origText;
    btn.disabled = false;
    if (analytics) {
      analyticsCache = analytics;
      setAnalyticsStatus('ok');
    }
    exportFn({ ...d, analytics: analytics ?? null });
  });
}

// ── Excel export (HTML→XLS trick, no library needed) ─────────────────────────
function exportAsExcel(d) {
  const date = new Date().toLocaleString();
  let body = '';

  if (d.hasCalc) {
    const r = d.calculator;
    body += `
      <h2>Cost Calculator Results — ${new Date(r.date).toLocaleString()}</h2>
      <table>
        <tr><th>Parameter</th><th>Value</th></tr>
        <tr><td>Crop</td><td>${r.crop}</td></tr>
        <tr><td>Area (ha)</td><td>${r.area}</td></tr>
        <tr><td>Cost per ha (USD)</td><td>${r.costPerHa.toFixed(2)}</td></tr>
        <tr><td>Total cost (USD)</td><td>${r.totalCost.toFixed(2)}</td></tr>
        <tr><td>Expected yield (t)</td><td>${r.totalYield.toFixed(1)}</td></tr>
        <tr><td>Market price ($/t)</td><td>${r.price.toFixed(2)}</td></tr>
        <tr><td>Revenue (USD)</td><td>${r.revenue.toFixed(2)}</td></tr>
        <tr><td>Net profit/loss (USD)</td><td>${r.profit.toFixed(2)}</td></tr>
        <tr><td>Break-even price ($/t)</td><td>${r.breakEven.toFixed(2)}</td></tr>
      </table><br>`;
  }

  if (d.hasPrices) {
    body += `
      <h2>Market Prices — ${date}</h2>
      <table>
        <tr><th>Crop</th><th>Price (USD)</th><th>Unit</th><th>Change (%)</th></tr>
        ${Object.entries(d.prices).map(([, p]) => {
          const sign = p.change >= 0 ? '+' : '';
          return `<tr><td>${p.name}</td><td>${p.price}</td><td>${p.unit}</td><td>${sign}${p.change.toFixed(2)}</td></tr>`;
        }).join('')}
      </table>`;
  }

  if (d.analytics) {
    const a = d.analytics;
    body += `
      <h2>AI Analytics — ${date}</h2>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Scans</td><td>${a.scans}</td></tr>
        <tr><td>Data quality</td><td>${a.data_quality.toFixed(2)}</td></tr>
        <tr><td>Crop condition</td><td>${a.crop_condition.toFixed(2)}</td></tr>
        <tr><td>Animal health</td><td>${a.animal_health.toFixed(2)}</td></tr>
        <tr><td>Water supply</td><td>${a.water_supply.toFixed(2)}</td></tr>
      </table>
      ${a.insight_critical ? `<p style="color:#dc2626"><strong>Critical:</strong> ${a.insight_critical}</p>` : ''}
      ${a.insight_warning  ? `<p style="color:#d97706"><strong>Warning:</strong> ${a.insight_warning}</p>` : ''}
      ${a.insight_info     ? `<p style="color:#2563eb"><strong>Info:</strong> ${a.insight_info}</p>` : ''}
      ${a.narrative ? `<p style="color:#57534e">${a.narrative}</p>` : ''}
      ${a.recommendations?.length ? `
        <h3>Recommendations</h3>
        <table>
          <tr><th>Item</th><th>Priority</th></tr>
          ${a.recommendations.map(r => `<tr><td>${r.id}</td><td>${r.priority}</td></tr>`).join('')}
        </table>` : ''}`;
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8">
  <style>
    th { background:#059669; color:white; padding:8px 10px; }
    td { padding:6px 10px; border-bottom:1px solid #e5e7eb; }
    h2 { color:#065f46; margin-top:12px; font-size:14px; }
  </style></head><body>${body}</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `farm-report-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PDF export (via extension report page) ─────────────────────────────────
function exportAsPDF(d) {
  const reportData = {
    hasCalc:    d.hasCalc,
    hasPrices:  d.hasPrices,
    calculator: d.calculator,
    prices:     d.prices,
    analytics:  d.analytics,
    generated:  Date.now(),
    // Attach real farm context if available
    user:       userData ? {
      email:    userData.email || userData.me?.email,
      farmName: userData.farms?.[0]?.name,
      fieldsCount: userData.zones?.length ?? 0,
      herdsCount:  userData.herds?.length ?? 0,
      tasksDone:   (userData.tasks ?? []).filter(t => t.status === 'done').length,
      tasksPending:(userData.tasks ?? []).filter(t => t.status !== 'done').length,
    } : null,
  };

  // Store in session storage, then open the report page
  chrome.storage.session.set({ farm_report_data: reportData }, () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  });
}
