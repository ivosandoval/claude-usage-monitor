(() => {
  'use strict';

  let allSnapshots = [];
  let activeDays = 7;

  // --- Init ---

  chrome.storage.local.get(['snapshots'], ({ snapshots = [] }) => {
    allSnapshots = snapshots;
    render();
  });

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDays = parseInt(btn.dataset.days, 10);
      render();
    });
  });

  document.getElementById('btn-export').addEventListener('click', exportCSV);

  // --- Render ---

  function render() {
    const cutoff = Date.now() - activeDays * 24 * 60 * 60 * 1000;
    const snapshots = allSnapshots.filter(s => s.ts >= cutoff);

    const empty = document.getElementById('empty');
    const content = document.getElementById('content');

    if (snapshots.length < 2) {
      empty.style.display = '';
      content.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    content.style.display = '';

    renderStats(snapshots);

    drawChart('chart-s',  snapshots, 's',  '#4ade80', 100, v => `${v}%`);
    drawChart('chart-wa', snapshots, 'wa', '#fbbf24', 100, v => `${v}%`);
    drawChart('chart-ws', snapshots, 'ws', '#ef4444', 100, v => `${v}%`);

    const aeValues = snapshots.map(s => s.ae).filter(v => v != null);
    const aeMax = aeValues.length ? Math.max(...aeValues) * 1.25 : 100;
    drawChart('chart-ae', snapshots, 'ae', '#D97757', Math.max(aeMax, 1), v => `${v.toFixed(0)}€`);
  }

  // --- Stats ---

  function renderStats(snapshots) {
    updateStat('s',  snapshots, '%');
    updateStat('wa', snapshots, '%');
    updateStat('ws', snapshots, '%');

    const aeVals = snapshots.map(s => s.ae).filter(v => v != null);
    const aeEl   = document.getElementById('stat-ae-last');
    const aeRange = document.getElementById('stat-ae-range');

    if (aeVals.length) {
      aeEl.textContent = `${aeVals[aeVals.length - 1].toFixed(2)} €`;
      aeRange.textContent = `min ${Math.min(...aeVals).toFixed(2)} € / max ${Math.max(...aeVals).toFixed(2)} €`;
    } else {
      aeEl.textContent = '—';
      aeRange.textContent = 'no data';
    }
  }

  function updateStat(key, snapshots, unit) {
    const vals = snapshots.map(s => s[key]).filter(v => v != null);
    const avgEl  = document.getElementById(`stat-${key}-avg`);
    const rangeEl = document.getElementById(`stat-${key}-range`);

    if (!vals.length) {
      avgEl.textContent = '—';
      rangeEl.textContent = 'no data';
      return;
    }

    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    avgEl.textContent = `${avg}${unit}`;
    rangeEl.textContent = `min ${Math.min(...vals)}${unit} / max ${Math.max(...vals)}${unit}`;
  }

  // --- Chart ---

  function drawChart(id, snapshots, key, color, yMax, formatY) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 16, right: 20, bottom: 40, left: 44 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top  - pad.bottom;

    // Background
    ctx.fillStyle = '#16162a';
    ctx.fillRect(0, 0, w, h);

    const pts = snapshots.filter(s => s[key] != null);

    if (pts.length < 2) {
      ctx.fillStyle = '#555577';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Not enough data for this range', w / 2, h / 2);
      return;
    }

    const minTs = pts[0].ts;
    const maxTs = pts[pts.length - 1].ts;
    const tsRange = maxTs - minTs || 1;

    const toX = ts  => pad.left + ((ts  - minTs) / tsRange) * cw;
    const toY = val => pad.top  + ch - (val / yMax) * ch;

    // Grid lines
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const val = (yMax / gridCount) * i;
      const y = toY(val);

      ctx.strokeStyle = '#2a2a45';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = '#555577';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatY(val), pad.left - 5, y);
    }

    // Area fill
    ctx.beginPath();
    pts.forEach((p, i) => {
      i === 0 ? ctx.moveTo(toX(p.ts), toY(p[key])) : ctx.lineTo(toX(p.ts), toY(p[key]));
    });
    ctx.lineTo(toX(pts[pts.length - 1].ts), pad.top + ch);
    ctx.lineTo(toX(pts[0].ts), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = color + '28';
    ctx.fill();

    // Line
    ctx.beginPath();
    pts.forEach((p, i) => {
      i === 0 ? ctx.moveTo(toX(p.ts), toY(p[key])) : ctx.lineTo(toX(p.ts), toY(p[key]));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Last point dot + label
    const last = pts[pts.length - 1];
    const lx = toX(last.ts);
    const ly = toY(last[key]);

    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const labelX = lx + 8 + 30 > w - pad.right ? lx - 36 : lx + 8;
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatY(last[key]), labelX, ly);

    // X axis time labels
    const labelCount = Math.min(5, pts.length);
    ctx.fillStyle = '#555577';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < labelCount; i++) {
      const idx  = Math.floor(i * (pts.length - 1) / Math.max(1, labelCount - 1));
      const p    = pts[idx];
      const x    = toX(p.ts);
      const date = new Date(p.ts);
      const label = activeDays === 1
        ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
        : `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}h`;
      ctx.fillText(label, x, pad.top + ch + 8);
    }
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // --- CSV Export ---

  function exportCSV() {
    if (!allSnapshots.length) {
      alert('No history data yet.');
      return;
    }
    const header = 'timestamp,date,session_%,weekly_all_%,weekly_sonnet_%,additional_eur';
    const rows = allSnapshots.map(s => {
      const d = new Date(s.ts).toISOString();
      return `${s.ts},${d},${s.s ?? ''},${s.wa ?? ''},${s.ws ?? ''},${s.ae ?? ''}`;
    });
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `claude-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
})();
