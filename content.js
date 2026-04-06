(() => {
  'use strict';

  const PATTERNS = {
    percentage: /(\d+)\s*%\s*(usado|used)/i,
    resetTime: /(se restablece en|resets?\s+in)\s+(.+)/i,
    plan: /(Max|Pro)\s*\((\d+)x\)/i,
    spent: /([\d,.]+)\s*[€$]\s*(gastados|spent)|([€$])\s*([\d,.]+)\s*(gastados|spent)/i,
    limit: /([\d,.]+)\s*[€$]\s*l[íi]mite|([€$])\s*([\d,.]+)\s*limit/i,
    resetDate: /(se restablece el|resets?)\s+(\w+\s+\d+)/i,
    sessionHeader: /(current session|sesi[óo]n actual)/i,
    weeklyHeader: /(weekly limits|l[íi]mites semanales)/i,
    allModels: /(all models|todos los modelos)/i,
    sonnetOnly: /(sonnet only|solo sonnet)/i,
    additionalHeader: /(additional usage|uso adicional)/i
  };

  let debounceTimer = null;
  let lastSentHash = '';

  // --- Strategy 1: DOM Observer ---

  function findUsagePanel() {
    // Look for containers with usage-related text
    const candidates = document.querySelectorAll(
      '[role="dialog"], [data-testid*="usage"], [data-testid*="billing"], ' +
      '[class*="usage"], [class*="billing"], [class*="modal"], [class*="popover"], ' +
      '[class*="dropdown"], [class*="panel"], [class*="overlay"], [class*="settings"]'
    );

    for (const el of candidates) {
      if (containsUsageText(el)) return el;
    }

    // Broader search: walk body's direct children and common containers
    const allSections = document.querySelectorAll('section, aside, [role="complementary"], main > div');
    for (const el of allSections) {
      if (containsUsageText(el)) return el;
    }

    // Last resort: check body text
    if (containsUsageText(document.body)) return document.body;

    return null;
  }

  function containsUsageText(el) {
    const text = el?.innerText || '';
    return (
      (PATTERNS.sessionHeader.test(text) || PATTERNS.weeklyHeader.test(text)) &&
      PATTERNS.percentage.test(text)
    );
  }

  function scrapeUsageData(rootEl) {
    if (!rootEl) return null;

    const text = rootEl.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const data = {};
    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect sections
      if (PATTERNS.sessionHeader.test(line)) {
        currentSection = 'session';
        continue;
      }
      if (PATTERNS.allModels.test(line)) {
        currentSection = 'weeklyAll';
        continue;
      }
      if (PATTERNS.sonnetOnly.test(line)) {
        currentSection = 'weeklySonnet';
        continue;
      }
      if (PATTERNS.additionalHeader.test(line)) {
        currentSection = 'additional';
        continue;
      }
      if (PATTERNS.weeklyHeader.test(line)) {
        currentSection = 'weekly';
        continue;
      }

      // Extract plan name
      const planMatch = line.match(PATTERNS.plan);
      if (planMatch) {
        if (!data.session) data.session = {};
        data.session.planName = planMatch[0];
        continue;
      }

      // Extract percentage
      const pctMatch = line.match(PATTERNS.percentage);
      if (pctMatch && currentSection) {
        const section = currentSection === 'weekly' ? 'weeklyAll' : currentSection;
        if (!data[section]) data[section] = {};
        data[section].percent = parseInt(pctMatch[1], 10);
        continue;
      }

      // Extract reset time
      const resetMatch = line.match(PATTERNS.resetTime);
      if (resetMatch && currentSection) {
        const section = currentSection === 'weekly' ? 'weeklyAll' : currentSection;
        if (!data[section]) data[section] = {};
        data[section].resetTime = resetMatch[2].trim();
        continue;
      }

      // Extract spent amount (additional usage)
      const spentMatch = line.match(PATTERNS.spent);
      if (spentMatch && currentSection === 'additional') {
        if (!data.additional) data.additional = {};
        data.additional.spent = line.replace(/(gastados|spent)/i, '').trim();
        continue;
      }

      // Extract limit (additional usage)
      const limitMatch = line.match(PATTERNS.limit);
      if (limitMatch && currentSection === 'additional') {
        if (!data.additional) data.additional = {};
        data.additional.limit = line.replace(/(l[íi]mite|limit)/i, '').trim();
        continue;
      }

      // Extract reset date (additional usage)
      const resetDateMatch = line.match(PATTERNS.resetDate);
      if (resetDateMatch && currentSection === 'additional') {
        if (!data.additional) data.additional = {};
        data.additional.resetDate = resetDateMatch[2].trim();
      }
    }

    // Also try extracting from progress bars
    extractFromProgressBars(rootEl, data);

    return hasUsefulData(data) ? data : null;
  }

  function extractFromProgressBars(rootEl, data) {
    const progressBars = rootEl.querySelectorAll(
      '[role="progressbar"], progress, [class*="progress"], [class*="Progress"]'
    );

    const sections = ['session', 'weeklyAll', 'weeklySonnet', 'additional'];
    let barIndex = 0;

    for (const bar of progressBars) {
      if (barIndex >= sections.length) break;
      const section = sections[barIndex];

      let value = bar.getAttribute('aria-valuenow') ||
                  bar.getAttribute('value') ||
                  bar.dataset.value;

      if (!value) {
        const style = bar.style.width || bar.querySelector('[style*="width"]')?.style.width;
        if (style) {
          const widthMatch = style.match(/([\d.]+)%/);
          if (widthMatch) value = widthMatch[1];
        }
      }

      if (value && !data[section]?.percent) {
        if (!data[section]) data[section] = {};
        data[section].percent = Math.round(parseFloat(value));
      }

      barIndex++;
    }
  }

  function hasUsefulData(data) {
    return data &&
      (data.session?.percent != null ||
       data.weeklyAll?.percent != null ||
       data.weeklySonnet?.percent != null);
  }

  function sendDataToBackground(data) {
    const hash = JSON.stringify(data);
    if (hash === lastSentHash) return;
    lastSentHash = hash;

    chrome.runtime.sendMessage({ type: 'USAGE_DATA', data }).catch(() => {});
  }

  function tryScrape() {
    const panel = findUsagePanel();
    if (!panel) return;

    const data = scrapeUsageData(panel);
    if (data) sendDataToBackground(data);
  }

  // Debounced observer callback
  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(tryScrape, 200);
  }

  const observer = new MutationObserver(onMutation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Periodic check every 30 seconds
  setInterval(tryScrape, 30000);

  // Initial scrape
  setTimeout(tryScrape, 1000);

  // Listen for scrape requests from background/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCRAPE_NOW') {
      tryScrape();
      sendResponse({ ok: true });
    }
    return true;
  });

  // --- Strategy 2: Fetch interceptor (injected.js via MAIN world) ---

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'CLAUDE_USAGE_INTERCEPTED') return;

    const parsed = parseInterceptedData(event.data.data, event.data.url);
    if (parsed) sendDataToBackground(parsed);
  });

  function parseInterceptedData(json, url) {
    if (!json || typeof json !== 'object') return null;

    // Attempt to map common API response shapes to our schema
    const data = {};

    // Look for session/rate limit data
    if (json.session_usage != null || json.rate_limit != null) {
      const src = json.session_usage || json.rate_limit || json;
      if (src.percent != null || src.percentage != null || src.used != null) {
        data.session = {
          percent: src.percent ?? src.percentage ?? src.used,
          resetTime: src.reset_time || src.resetTime || src.resets_in || null,
          planName: src.plan_name || src.planName || null
        };
      }
    }

    // Look for weekly data
    if (json.weekly_usage || json.weekly) {
      const w = json.weekly_usage || json.weekly;
      if (w.all_models || w.all) {
        const am = w.all_models || w.all;
        data.weeklyAll = {
          percent: am.percent ?? am.percentage ?? am.used,
          resetTime: am.reset_time || am.resets_in || null
        };
      }
      if (w.sonnet || w.sonnet_only) {
        const s = w.sonnet || w.sonnet_only;
        data.weeklySonnet = {
          percent: s.percent ?? s.percentage ?? s.used,
          resetTime: s.reset_time || s.resets_in || null
        };
      }
    }

    return hasUsefulData(data) ? data : null;
  }

})();
