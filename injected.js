(function () {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const keywords = ['rate_limit', 'usage', 'billing', 'subscription'];
      if (keywords.some(k => url.toLowerCase().includes(k))) {
        response.clone().json().then(data => {
          window.postMessage({ type: 'CLAUDE_USAGE_INTERCEPTED', url, data }, '*');
        }).catch(() => {});
      }
    } catch {}
    return response;
  };
})();
