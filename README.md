# Claude Usage Monitor

Chrome extension that displays your Claude AI usage limits directly in the browser toolbar — no need to navigate to settings.

![Chrome Extension](https://img.shields.io/badge/Manifest-V3-blue) ![Claude](https://img.shields.io/badge/Claude-Max%20Plan-D97757) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Toolbar badge** with session usage percentage, color-coded (green / yellow / red)
- **Dark-themed popup** matching Claude's design language
- **Works without the usage panel open** — reads data directly from the internal API
- **Auto-refresh** every 5 minutes via background service worker
- **30-day history** with line charts (session, weekly, additional usage)
- **Export CSV** for your own analysis
- **Bilingual** — works with claude.ai in English and Spanish
- **Zero configuration** — install and go

## What It Shows

| Metric | Example |
|--------|---------|
| Session usage | 13% · Resets in 4h 29min |
| Weekly — All Models | 2% · Resets in 6d 18h |
| Weekly — Sonnet | 3% · Resets in 6d 18h |
| Additional usage | 20.87 € / 100.00 € |

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome (or any Chromium-based browser)
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the cloned folder
6. The extension icon appears in the toolbar immediately

> No build step required. Pure vanilla JavaScript, no dependencies.

## How It Works

```
background.js (service worker)
     │
     ├─► GET /api/organizations → GET /api/organizations/{id}/usage
     │         Every 5 min + on Refresh click
     │         credentials: include (uses your browser session)
     │
     ├─► chrome.storage.local (persist data + 30-day snapshots)
     ├─► Badge update (percentage + color)
     │
     └─► popup.js (renders UI on click)

claude.ai page (fallback when API doesn't return data)
     │
     ├─► injected.js (MAIN world) — Fetch interceptor
     │         Wraps window.fetch, captures /usage API responses
     │
     └─► content.js (ISOLATED world) — DOM Observer
               MutationObserver on usage panel text + progress bars
```

### Primary strategy — Direct API

The background service worker calls `https://claude.ai/api/organizations/{id}/usage` using your browser session cookies. This endpoint returns:

```json
{
  "five_hour":         { "utilization": 13,    "resets_at": "..." },
  "seven_day":         { "utilization": 2,     "resets_at": "..." },
  "seven_day_sonnet":  { "utilization": 3,     "resets_at": "..." },
  "extra_usage":       { "used_credits": 2087, "monthly_limit": 10000 }
}
```

> This endpoint is undocumented and was discovered by inspecting the Network tab on claude.ai. It may change without notice.

### Fallback strategy — DOM scraping + fetch interception

If the direct API call fails, the extension falls back to scraping the usage panel when visible, and intercepting fetch responses from claude.ai.

The DOM scraper (`content.js`) supports both English and Spanish claude.ai UI:

| Pattern | English | Spanish |
|---------|---------|---------|
| Usage % | `"28% used"` | `"28% usado"` |
| Reset time | `"Resets in 4h 29min"` | `"Se restablece en 4 h 29 min"` |
| Session header | `"Current session"` | `"Sesión actual"` |
| Weekly header | `"Weekly limits"` | `"Límites semanales"` |
| All models | `"All models"` | `"Todos los modelos"` |
| Sonnet only | `"Sonnet only"` | `"Solo Sonnet"` |
| Additional usage | `"Additional usage"` | `"Uso adicional"` |
| Spent | `"X € spent"` | `"X € gastados"` |

## Project Structure

```
claude-chrome-extension/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — API fetch, storage, badge, alarms
├── injected.js         # Fetch interceptor (MAIN world, no CSP issues)
├── content.js          # DOM scraping fallback + postMessage relay
├── popup.html          # Popup markup
├── popup.css           # Dark theme styles
├── popup.js            # Popup rendering and interaction
├── history.html        # Full-page history view
├── history.js          # Charts (Canvas API) + CSV export
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Debugging

| What | How |
|------|-----|
| Background / API calls | `chrome://extensions/` → "Service Worker" link |
| Raw API response | In Service Worker console: `chrome.storage.local.get('apiRawData', console.log)` |
| Popup | Right-click extension icon → "Inspect popup" |
| Content script | DevTools on claude.ai → Console tab |
| Clear all data | `chrome.storage.local.clear()` in Service Worker console |

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Persist usage data and 30-day history |
| `alarms` | 5-minute heartbeat for background refresh |
| `host_permissions: claude.ai/*` | API calls and content script injection |

The extension **does not** collect, transmit, or share any data. Everything stays in your browser's local storage.

## Known Limitations

- **Undocumented API** — Anthropic may change the `/usage` endpoint at any time. If data stops showing, check the Network tab on claude.ai for the current endpoint shape.
- **Requires an active claude.ai session** — the extension uses your browser cookies. If you're logged out, no data is fetched.
- **Reset countdown is static** — shows the last fetched value, doesn't count down in real time.
- **Currency hardcoded to €** — additional usage is displayed in euros. If your account uses a different currency, the amounts will still be correct but the symbol won't match.

## Roadmap

- [ ] Configurable alert thresholds (browser notification at 80%)
- [ ] Real-time countdown timer for reset times
- [ ] Currency detection from API response
- [ ] Chrome Web Store packaging

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript — no frameworks, no build step
- Canvas API for history charts
- `chrome.storage.local` for persistence
- `chrome.alarms` for periodic refresh

## License

MIT
