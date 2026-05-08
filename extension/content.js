(function () {
  // ── Signal to the host page that the extension is installed ──────────────
  document.documentElement.setAttribute('data-farm-ext-installed', '1');
  document.documentElement.setAttribute('data-farm-ext-version', '1.0.0');

  // ── Only do auth watching on our own platform ─────────────────────────────
  const isFarmSite = true
    // location.hostname.includes('cursor-farm') ||
    // location.hostname === 'localhost' ||
    // location.hostname === '127.0.0.1';

  if (isFarmSite) {
    watchLoginForm();
    syncExistingToken();
    watchTokenInStorage();
  }

  // ── Answer popup's direct token request (GET_TOKEN message) ─────────────
  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'GET_TOKEN') {
      sendResponse({ token: localStorage.getItem('farm_token'), apiOrigin: getApiOrigin() });
    }
  });

  // ── Respond to postMessage pings (install-prompt detection) ───────────────
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'FARM_EXT_PING') {
      window.postMessage({ type: 'FARM_EXT_PONG', version: '1.0.0' }, '*');
    }
  });

  // ── Watch #login and #password form submission ────────────────────────────
  function watchLoginForm() {
    document.addEventListener('submit', function () {
      const loginInput = document.getElementById('login');
      const passwordInput = document.getElementById('password');

      // Both IDs must be present — confirms this is the login form
      if (!loginInput || !passwordInput) return;

      const email = loginInput.value.trim();
      if (!email) return;

      chrome.runtime.sendMessage({ type: 'FORM_LOGIN', email: email, pageContext: getPageContext() });
    });
  }

  // ── Sync token already stored in localStorage (user was already logged in) ──
  function syncExistingToken() {
    const token = localStorage.getItem('farm_token');
    if (token) {
      chrome.runtime.sendMessage({
        type: 'SYNC_TOKEN',
        token: token,
        apiOrigin: getApiOrigin(),
        pageContext: getPageContext(),
      });
    } else {
      // No token on farm site → user has logged out; clear extension cache
      chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' });
    }
  }

  // ── Intercept localStorage to catch login/logout in the same tab ──────────
  function watchTokenInStorage() {
    const _setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      _setItem(key, value);
      if (key === 'farm_token' && value) {
        chrome.runtime.sendMessage({
          type: 'SYNC_TOKEN',
          token: value,
          apiOrigin: getApiOrigin(),
          pageContext: getPageContext(),
        });
      }
    };

    const _removeItem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (key) {
      _removeItem(key);
      if (key === 'farm_token') {
        chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' });
      }
    };

    const _clear = localStorage.clear.bind(localStorage);
    localStorage.clear = function () {
      _clear();
      chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' });
    };

    // Cross-tab: storage event fires when another tab changes localStorage
    window.addEventListener('storage', function (e) {
      if (e.key !== 'farm_token') return;
      if (e.newValue) {
        chrome.runtime.sendMessage({
          type: 'SYNC_TOKEN',
          token: e.newValue,
          apiOrigin: getApiOrigin(),
          pageContext: getPageContext(),
        });
      } else {
        chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' });
      }
    });
  }

  function getApiOrigin() {
    try {
      const entries = performance.getEntriesByType('resource') || [];
      const apiEntry = entries.find((entry) => {
        try {
          const url = new URL(entry.name);
          return /\/api\/(auth|dashboard|farms)\b/.test(url.pathname);
        } catch {
          return false;
        }
      });
      if (apiEntry) return new URL(apiEntry.name).origin;
    } catch {
      // Fall back to same-origin API below.
    }
    return location.origin;
  }

  function getPageContext() {
    let timezone = '';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      timezone = '';
    }

    return {
      pageUrl: location.href,
      referrer: document.referrer || '',
      language: navigator.language || '',
      timezone: timezone,
    };
  }
})();
