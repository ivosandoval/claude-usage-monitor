document.addEventListener('DOMContentLoaded', () => {
  const noData = document.getElementById('no-data');
  const dataContainer = document.getElementById('data-container');
  const lastUpdatedEl = document.getElementById('last-updated');

  loadData();

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REQUEST_SCRAPE' });
    setTimeout(loadData, 1000);
  });

  // Open usage panel
  document.getElementById('btn-open-usage').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
  });

  // Open history page
  document.getElementById('btn-history').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  });

  // Export CSV
  document.getElementById('btn-csv').addEventListener('click', () => {
    chrome.storage.local.get(['snapshots'], ({ snapshots = [] }) => {
      if (!snapshots.length) {
        alert('No history data yet. Click Refresh to capture your first snapshot.');
        return;
      }
      const header = 'timestamp,date,session_%,weekly_all_%,weekly_sonnet_%,additional_eur';
      const rows = snapshots.map(s => {
        const d = new Date(s.ts).toISOString();
        return `${s.ts},${d},${s.s ?? ''},${s.wa ?? ''},${s.ws ?? ''},${s.ae ?? ''}`;
      });
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claude-usage-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  document.getElementById('open-claude-nodata')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
  });

  // Listen for storage changes to update in real time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.usageData) {
      renderData(changes.usageData.newValue);
    }
  });

  function loadData() {
    chrome.storage.local.get('usageData', ({ usageData }) => {
      renderData(usageData);
    });
  }

  function renderData(data) {
    if (!data || (!data.session && !data.weeklyAll && !data.weeklySonnet)) {
      noData.classList.remove('hidden');
      dataContainer.classList.add('hidden');
      lastUpdatedEl.textContent = '';
      return;
    }

    noData.classList.add('hidden');
    dataContainer.classList.remove('hidden');

    renderSection('session', data.session);
    renderSection('weeklyAll', data.weeklyAll);
    renderSection('weeklySonnet', data.weeklySonnet);
    renderAdditional(data.additional);

    // Plan badge
    const planEl = document.getElementById('plan-name');
    planEl.textContent = data.session?.planName || '';

    // Last updated
    if (data.lastUpdated) {
      lastUpdatedEl.textContent = `Last updated: ${timeAgo(data.lastUpdated)}`;
    }
  }

  function renderSection(key, section) {
    const sectionEl = document.getElementById(`section-${key}`);
    const barEl = document.getElementById(`bar-${key}`);
    const pctEl = document.getElementById(`pct-${key}`);
    const resetEl = document.getElementById(`reset-${key}`);

    if (!section || section.percent == null) {
      sectionEl.classList.add('hidden');
      return;
    }

    sectionEl.classList.remove('hidden');
    const pct = Math.min(100, Math.max(0, section.percent));

    barEl.style.width = `${pct}%`;
    barEl.style.backgroundColor = getBarColor(pct);
    pctEl.textContent = `${pct}%`;
    pctEl.style.color = getBarColor(pct);

    if (section.resetTime) {
      resetEl.textContent = `Resets in ${section.resetTime}`;
    } else {
      resetEl.textContent = '';
    }
  }

  function renderAdditional(additional) {
    const sectionEl = document.getElementById('section-additional');
    const spentEl = document.getElementById('additional-spent');
    const limitEl = document.getElementById('additional-limit');
    const resetEl = document.getElementById('reset-additional');

    if (!additional) {
      sectionEl.classList.add('hidden');
      return;
    }

    sectionEl.classList.remove('hidden');
    spentEl.textContent = additional.spent || '—';
    limitEl.textContent = additional.limit || '—';

    if (additional.resetDate) {
      resetEl.textContent = `Resets ${additional.resetDate}`;
    } else {
      resetEl.textContent = '';
    }
  }

  function getBarColor(percent) {
    if (percent <= 50) return '#4ade80';
    if (percent <= 75) return '#fbbf24';
    return '#ef4444';
  }

  function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);

    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
});
