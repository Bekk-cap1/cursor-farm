const PRICES_KEY    = 'market_prices';
const USER_KEY      = 'farm_user';       // { email, token, apiOrigin, farms, zones, fetchedAt }
const ADMIN_NOTIFY_KEY = 'farm_admin_visit_notify';
const UPDATE_INTERVAL = 15; // minutes
const ADMIN_NOTIFY_INTERVAL = 1 * 60 * 1000; // 10 minutes per user

// ── Commodity base prices ─────────────────────────────────────────────────────
const BASE_PRICES = {
  wheat:     { name: 'Wheat / Пшеница',      unit: 't',  base: 220   },
  corn:      { name: 'Corn / Кукуруза',       unit: 't',  base: 185   },
  soybean:   { name: 'Soybean / Соя',         unit: 't',  base: 380   },
  cotton:    { name: 'Cotton / Хлопок',       unit: 'lb', base: 0.88  },
  rice:      { name: 'Rice / Рис',            unit: 't',  base: 450   },
  sunflower: { name: 'Sunflower / Подсолнух', unit: 't',  base: 440   },
  barley:    { name: 'Barley / Ячмень',       unit: 't',  base: 200   },
  potato:    { name: 'Potato / Картофель',    unit: 't',  base: 180   },
};

// ── Price simulation ──────────────────────────────────────────────────────────
function simulatePrices(current) {
  const now = Date.now();
  const prices = {};
  for (const [key, info] of Object.entries(BASE_PRICES)) {
    const prev      = current?.[key];
    const lastPrice = prev?.price ?? info.base;
    const movement  = (Math.random() - 0.48) * 0.015 * lastPrice;
    const newPrice  = Math.max(lastPrice + movement, info.base * 0.60);
    const prevPrice = prev?.price ?? info.base;
    const decimals  = info.unit === 'lb' ? 4 : 2;
    prices[key] = {
      name:      info.name,
      unit:      info.unit,
      price:     parseFloat(newPrice.toFixed(decimals)),
      prevPrice: parseFloat(prevPrice.toFixed(decimals)),
      change:    parseFloat(((newPrice - prevPrice) / prevPrice * 100).toFixed(2)),
      updated:   now,
    };
  }
  return prices;
}

async function updatePrices() {
  const stored = await chrome.storage.local.get(PRICES_KEY);
  const prices = simulatePrices(stored[PRICES_KEY]);
  await chrome.storage.local.set({ [PRICES_KEY]: prices });
  return prices;
}

// ── Farm API data fetching ────────────────────────────────────────────────────
async function fetchFarmData(token, apiOrigin) {
  const base    = apiOrigin || 'https://cursor-farm-1.onrender.com';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    const [meRes, farmsRes] = await Promise.all([
      fetch(`${base}/api/auth/me`, { headers }),
      fetch(`${base}/api/farms`, { headers }),
    ]);
    if (!meRes.ok || !farmsRes.ok) return null;

    const me    = await meRes.json();
    const farms = await farmsRes.json();

    let zones = [], herds = [], tasks = [];
    if (farms.length > 0) {
      const fid = farms[0].id;
      const [zRes, hRes, tRes] = await Promise.all([
        fetch(`${base}/api/farms/${fid}/zones/`, { headers }),
        fetch(`${base}/api/farms/${fid}/herds/`, { headers }),
        fetch(`${base}/api/farms/${fid}/tasks/`, { headers }),
      ]);
      if (zRes.ok) zones = await zRes.json();
      if (hRes.ok) herds = await hRes.json();
      if (tRes.ok) tasks = await tRes.json();
    }

    let analytics = null;
    try {
      const aRes = await fetch(`${base}/api/dashboard/analyze?lang=en`, { method: 'POST', headers });
      if (aRes.ok) analytics = await aRes.json();
    } catch { /* analytics optional */ }

    return { me, farms, zones, herds, tasks, analytics, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

async function notifyAdminVisit(user, pageContext, { eventType = 'popup_open', email = '' } = {}) {
  const base = user?.apiOrigin || 'https://cursor-farm-1.onrender.com';
  const resolvedEmail = user?.me?.email || user?.email || email || '';
  const userId = user?.me?.id || '';
  const signature = `${eventType}|${base}|${userId || 'anon'}|${resolvedEmail || pageContext?.pageUrl || 'unknown'}`;
  const now = Date.now();
  const stored = await chrome.storage.local.get(ADMIN_NOTIFY_KEY);
  const previous = stored[ADMIN_NOTIFY_KEY] || {};

  if (previous.signature === signature && previous.at && (now - previous.at) < ADMIN_NOTIFY_INTERVAL) {
    return;
  }

  const version = chrome.runtime.getManifest?.().version || 'unknown';
  const headers = { 'Content-Type': 'application/json' };
  if (user?.token) headers['Authorization'] = `Bearer ${user.token}`;

  try {
    const res = await fetch(`${base}/api/extension/visit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'extension',
        event_type: eventType,
        email: resolvedEmail,
        extension_version: version,
        page_url: pageContext?.pageUrl || '',
        referrer: pageContext?.referrer || '',
        language: pageContext?.language || '',
        timezone: pageContext?.timezone || '',
      }),
    });

    const result = res.ok ? await res.json().catch(() => null) : null;
    if (result?.telegram_sent) {
      await chrome.storage.local.set({ [ADMIN_NOTIFY_KEY]: { signature, at: now } });
    }
  } catch {
    // Admin notifications are best-effort; core extension features should still work.
  }
}

async function getActivePageContext() {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return {
      pageUrl: tab?.url || '',
      referrer: '',
      language: navigator.language || '',
      timezone: timezone,
    };
  } catch {
    return { pageUrl: '', referrer: '', language: navigator.language || '', timezone: timezone };
  }
}

// ── Extension lifecycle ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await updatePrices();
  await chrome.alarms.clear('priceUpdate');
  chrome.alarms.create('priceUpdate', { periodInMinutes: UPDATE_INTERVAL });
  // First heartbeat immediately on install
  await chrome.alarms.clear('heartbeat');
  chrome.alarms.create('heartbeat', { delayInMinutes: 1, periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(async () => {
  const existing = await chrome.alarms.get('priceUpdate');
  if (!existing) chrome.alarms.create('priceUpdate', { periodInMinutes: UPDATE_INTERVAL });
  const hb = await chrome.alarms.get('heartbeat');
  if (!hb) chrome.alarms.create('heartbeat', { delayInMinutes: 1, periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'priceUpdate') await updatePrices();
  if (alarm.name === 'heartbeat') {
    const s = await chrome.storage.local.get(USER_KEY);
    const user = s[USER_KEY] || null;
    const ctx = await getActivePageContext();
    await notifyAdminVisit(user, user?.pageContext || ctx, { eventType: 'heartbeat' });
  }
});

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // User typed in #login and submitted the form → capture email + notify
  if (msg.type === 'FORM_LOGIN') {
    chrome.storage.local.get(USER_KEY).then((s) => {
      const existing = s[USER_KEY] || {};
      chrome.storage.local.set({ [USER_KEY]: { ...existing, email: msg.email, pageContext: msg.pageContext } });
    });
    notifyAdminVisit(null, msg.pageContext, { eventType: 'login_attempt', email: msg.email });
    return;
  }

  // Token was set in localStorage (same-tab login or page reload)
  if (msg.type === 'SYNC_TOKEN') {
    const { token, apiOrigin, pageContext } = msg;
    chrome.storage.local.get(USER_KEY).then(async (s) => {
      const existing = s[USER_KEY] || {};
      // Avoid re-fetching if token hasn't changed and data is fresh (< 5 min)
      const fresh = existing.token === token &&
                    existing.fetchedAt &&
                    (Date.now() - existing.fetchedAt) < 5 * 60 * 1000;
      if (fresh) {
        await notifyAdminVisit(existing, pageContext || existing.pageContext);
        return;
      }

      const data = await fetchFarmData(token, apiOrigin);
      if (data) {
        const updated = { ...data, token, apiOrigin, email: data.me?.email || existing.email, pageContext };
        await chrome.storage.local.set({
          [USER_KEY]: updated,
        });
        await notifyAdminVisit(updated, pageContext);
      } else {
        // At least keep the token + email
        const updated = { ...existing, token, apiOrigin, pageContext };
        await chrome.storage.local.set({
          [USER_KEY]: updated,
        });
        await notifyAdminVisit(updated, pageContext);
      }
    });
    return;
  }

  // User logged out
  if (msg.type === 'CLEAR_TOKEN') {
    chrome.storage.local.remove(USER_KEY);
    return;
  }

  // Popup asks for market prices
  if (msg.type === 'GET_PRICES') {
    chrome.storage.local.get(PRICES_KEY).then((s) => {
      if (s[PRICES_KEY]) {
        sendResponse(s[PRICES_KEY]);
      } else {
        updatePrices().then(sendResponse);
      }
    });
    return true;
  }

  if (msg.type === 'REFRESH_PRICES') {
    updatePrices().then(sendResponse);
    return true;
  }

  // Popup asks for user + farm data
  if (msg.type === 'GET_USER_DATA') {
    chrome.storage.local.get(USER_KEY).then((s) => {
      const user = s[USER_KEY] || null;
      getActivePageContext().then((ctx) => notifyAdminVisit(user, user?.pageContext || ctx));
      sendResponse(user);
    });
    return true;
  }

  // Popup asks for analytics specifically (on-demand for export)
  if (msg.type === 'GET_ANALYTICS') {
    chrome.storage.local.get(USER_KEY).then(async (s) => {
      const user = s[USER_KEY];
      if (!user?.token) { sendResponse(null); return; }

      // Use cached analytics if under 10 min old
      if (user.analytics && user.fetchedAt && (Date.now() - user.fetchedAt) < 10 * 60 * 1000) {
        sendResponse(user.analytics);
        return;
      }

      const base    = user.apiOrigin || 'https://cursor-farm-1.onrender.com';
      const headers = { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' };
      try {
        const res = await fetch(`${base}/api/dashboard/analyze?lang=en`, { method: 'POST', headers });
        if (res.ok) {
          const analytics = await res.json();
          await chrome.storage.local.set({ [USER_KEY]: { ...user, analytics } });
          sendResponse(analytics);
        } else {
          sendResponse(null);
        }
      } catch {
        sendResponse(null);
      }
    });
    return true;
  }

  // Popup asks to re-fetch farm data (manual refresh)
  if (msg.type === 'REFRESH_USER_DATA') {
    chrome.storage.local.get(USER_KEY).then(async (s) => {
      const user = s[USER_KEY];
      if (!user?.token) { sendResponse(null); return; }
      const data = await fetchFarmData(user.token, user.apiOrigin);
      if (data) {
        const updated = { ...data, token: user.token, apiOrigin: user.apiOrigin, email: data.me?.email || user.email };
        await chrome.storage.local.set({ [USER_KEY]: updated });
        sendResponse(updated);
      } else {
        sendResponse(user);
      }
    });
    return true;
  }
});
