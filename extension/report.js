function fmtUSD(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReport(data) {
  const dateStr = new Date(data.generated).toLocaleString();
  let sections  = '';

  // Farm context banner (shown when user is logged in)
  if (data.user) {
    const u = data.user;
    sections += `
      <div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;gap:24px;flex-wrap:wrap;">
        ${u.email    ? `<span><strong>User:</strong> ${u.email}</span>` : ''}
        ${u.farmName ? `<span><strong>Farm:</strong> ${u.farmName}</span>` : ''}
        ${u.fieldsCount != null ? `<span><strong>Fields:</strong> ${u.fieldsCount}</span>` : ''}
        ${u.herdsCount  != null ? `<span><strong>Herds:</strong> ${u.herdsCount}</span>` : ''}
        ${u.tasksDone   != null ? `<span><strong>Tasks done:</strong> ${u.tasksDone} / pending: ${u.tasksPending}</span>` : ''}
      </div>`
  }

  if (data.analytics) {
    const a = data.analytics;
    sections += `
      <h2>AI Analytics</h2>
      ${a.narrative ? `<p style="color:#57534e;font-size:13px;margin-bottom:10px;line-height:1.5">${a.narrative}</p>` : ''}
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Scans</td><td>${a.scans}</td></tr>
        <tr><td>Data quality</td><td>${a.data_quality.toFixed(2)}</td></tr>
        <tr><td>Crop condition</td><td>${a.crop_condition.toFixed(2)}</td></tr>
        <tr><td>Animal health</td><td>${a.animal_health.toFixed(2)}</td></tr>
        <tr><td>Water supply</td><td>${a.water_supply.toFixed(2)}</td></tr>
      </table>
      ${a.insight_critical ? `<p class="insight critical"><strong>⚠ Critical:</strong> ${a.insight_critical}</p>` : ''}
      ${a.insight_warning  ? `<p class="insight warning"><strong>⚠ Warning:</strong> ${a.insight_warning}</p>` : ''}
      ${a.insight_info     ? `<p class="insight info"><strong>ℹ Info:</strong> ${a.insight_info}</p>` : ''}
      ${a.recommendations?.length ? `
        <p style="font-weight:600;margin-top:10px;margin-bottom:4px">Recommendations</p>
        <ul>${a.recommendations.map(r => `<li>[${r.priority.toUpperCase()}] ${r.id}</li>`).join('')}</ul>` : ''}`;
  }

  if (data.hasCalc && data.calculator) {
    const r = data.calculator;
    const isProfit = r.profit >= 0;
    sections += `
      <h2>Cost Calculator Results</h2>
      <p class="meta">Calculated: ${new Date(r.date).toLocaleString()}</p>
      <table>
        <tr><th>Parameter</th><th>Value</th></tr>
        <tr><td>Crop</td><td>${r.crop}</td></tr>
        <tr><td>Area</td><td>${r.area} ha</td></tr>
        <tr><td>Cost per hectare</td><td>${fmtUSD(r.costPerHa)}</td></tr>
        <tr><td>Total cost</td><td>${fmtUSD(r.totalCost)}</td></tr>
        <tr><td>Expected yield</td><td>${r.totalYield.toFixed(1)} t</td></tr>
        <tr><td>Market price</td><td>${fmtUSD(r.price)}/t</td></tr>
        <tr><td>Revenue</td><td>${fmtUSD(r.revenue)}</td></tr>
        <tr><td>Net profit / loss</td>
            <td class="${isProfit ? 'profit' : 'loss'}">${isProfit ? '+' : ''}${fmtUSD(r.profit)}</td></tr>
        <tr><td>Break-even price</td><td>${fmtUSD(r.breakEven)}/t</td></tr>
      </table>`;
  }

  if (data.hasPrices && data.prices) {
    const entries = Object.entries(data.prices);
    const updated = entries[0]?.[1]?.updated;
    sections += `
      <h2>Market Prices</h2>
      ${updated ? `<p class="meta">Last updated: ${new Date(updated).toLocaleString()}</p>` : ''}
      <table>
        <tr><th>Crop</th><th>Price (USD)</th><th>Unit</th><th>24h Change</th></tr>
        ${entries.map(([, p]) => {
          const up   = p.change >= 0;
          const sign = up ? '+' : '';
          const cls  = up ? 'change-up' : 'change-down';
          return `<tr>
            <td>${p.name}</td>
            <td><strong>$${p.price}</strong></td>
            <td>${p.unit}</td>
            <td class="${cls}">${sign}${p.change.toFixed(2)}%</td>
          </tr>`;
        }).join('')}
      </table>`;
  }

  return `
    <div class="report-header">
      <div class="report-icon">🌱</div>
      <div>
        <h1>Farm Platform Report</h1>
        <p class="meta">Generated: ${dateStr}</p>
      </div>
    </div>
    ${sections}
    <div class="footer">
      Farm Platform Tools — cursor-farm-1.onrender.com &nbsp;|&nbsp;
      Tips and prices are indicative. Verify with your agronomist before acting.
    </div>
    <div class="print-bar">
      <button class="btn-print" id="btn-print">🖨 Print / Save as PDF</button>
      <button class="btn-close" id="btn-close">✕ Close</button>
    </div>`;
}

// Read data from session storage and render
chrome.storage.session.get('farm_report_data', ({ farm_report_data }) => {
  const loading = document.getElementById('loading');
  const report  = document.getElementById('report');

  if (!farm_report_data) {
    loading.textContent = '⚠ No report data found. Please generate a report from the extension popup first.';
    return;
  }

  report.innerHTML = buildReport(farm_report_data);
  loading.style.display = 'none';
  report.style.display  = 'block';

  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-close').addEventListener('click', () => window.close());
});
