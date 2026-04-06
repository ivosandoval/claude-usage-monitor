chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('heartbeat', { periodInMinutes: 5 });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USAGE_DATA') {
    const data = { ...message.data, lastUpdated: Date.now() };
    chrome.storage.local.set({ usageData: data }, () => {
      updateBadge(data);
      saveSnapshot(data);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'REQUEST_SCRAPE') {
    attemptDirectFetch().then(found => {
      if (!found) notifyContentScripts();
    });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') {
    attemptDirectFetch().then(found => {
      if (!found) notifyContentScripts();
    });
  }
});

function updateBadge(data) {
  const percent = data?.session?.percent;
  if (percent == null) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  chrome.action.setBadgeText({ text: `${percent}%` });

  let color;
  if (percent < 50) color = '#4ade80';
  else if (percent <= 80) color = '#fbbf24';
  else color = '#ef4444';

  chrome.action.setBadgeBackgroundColor({ color });
}

function notifyContentScripts() {
  chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW' }).catch(() => {});
    }
  });
}

async function attemptDirectFetch() {
  try {
    const res = await fetch('https://claude.ai/api/organizations', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) return false;

    const orgs = await res.json();
    if (!Array.isArray(orgs) || orgs.length === 0) return false;

    const orgId = orgs[0].uuid || orgs[0].id;
    if (!orgId) return false;

    const endpoints = [
      `https://claude.ai/api/organizations/${orgId}/usage`
    ];

    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!r.ok) continue;
        const json = await r.json();
        // Always store raw response for debugging
        chrome.storage.local.set({ apiRawData: { url, json } });
        const parsed = parseApiResponse(json);
        if (parsed) {
          const data = { ...parsed, lastUpdated: Date.now() };
          chrome.storage.local.set({ usageData: data });
          updateBadge(data);
          saveSnapshot(data);
          return true;
        }
      } catch {}
    }
  } catch {}
  return false;
}

function parseApiResponse(json) {
  if (!json || typeof json !== 'object') return null;

  function toResetTime(resetsAt) {
    if (!resetsAt) return null;
    const ms = new Date(resetsAt) - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }

  const data = {};

  if (json.five_hour?.utilization != null) {
    data.session = {
      percent:   Math.round(json.five_hour.utilization),
      resetTime: toResetTime(json.five_hour.resets_at)
    };
  }

  if (json.seven_day?.utilization != null) {
    data.weeklyAll = {
      percent:   Math.round(json.seven_day.utilization),
      resetTime: toResetTime(json.seven_day.resets_at)
    };
  }

  if (json.seven_day_sonnet?.utilization != null) {
    data.weeklySonnet = {
      percent:   Math.round(json.seven_day_sonnet.utilization),
      resetTime: toResetTime(json.seven_day_sonnet.resets_at)
    };
  }

  if (json.extra_usage) {
    const eu = json.extra_usage;
    data.additional = {
      spent: `${(eu.used_credits  / 100).toFixed(2)} €`,
      limit: `${(eu.monthly_limit / 100).toFixed(2)} €`
    };
  }

  return (data.session || data.weeklyAll || data.weeklySonnet) ? data : null;
}

function saveSnapshot(data) {
  const rawSpent = data.additional?.spent || '';
  const ae = parseFloat(rawSpent.replace(',', '.').replace(/[^\d.]/g, '')) || null;

  const snapshot = {
    ts: Date.now(),
    s:  data.session?.percent      ?? null,
    wa: data.weeklyAll?.percent    ?? null,
    ws: data.weeklySonnet?.percent ?? null,
    ae
  };

  chrome.storage.local.get(['snapshots'], ({ snapshots = [] }) => {
    snapshots.push(snapshot);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    chrome.storage.local.set({ snapshots: snapshots.filter(s => s.ts > cutoff) });
  });
}

// Restore badge on startup and seed first snapshot if none exist yet
chrome.storage.local.get(['usageData', 'snapshots'], ({ usageData, snapshots = [] }) => {
  if (usageData) {
    updateBadge(usageData);
    if (snapshots.length === 0) saveSnapshot(usageData);
  }
});
