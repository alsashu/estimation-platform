'use strict';
const fs = require('fs');
const path = require('path');

const ALLURE_RESULTS = path.resolve(__dirname, '../allure-results');
const REPORTS_DIR = path.resolve(__dirname, '../reports');
const OUTPUT_FILE = path.join(REPORTS_DIR, 'dashboard.html');

function readAllureResults() {
  if (!fs.existsSync(ALLURE_RESULTS)) {
    console.log('No allure-results directory found. Run tests first.');
    return [];
  }

  const files = fs.readdirSync(ALLURE_RESULTS).filter(f => f.endsWith('-result.json'));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ALLURE_RESULTS, f), 'utf8'));
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function aggregateStats(results) {
  const stats = { total: 0, passed: 0, failed: 0, skipped: 0, broken: 0, duration: 0 };
  const moduleMap = {};
  const labelSuite = {};

  for (const r of results) {
    stats.total++;
    if (r.status === 'passed') stats.passed++;
    else if (r.status === 'failed') stats.failed++;
    else if (r.status === 'skipped') stats.skipped++;
    else if (r.status === 'broken') { stats.broken++; stats.failed++; }

    stats.duration += r.duration || 0;

    // Infer module from suite label or fullName
    const suiteLabel = (r.labels || []).find(l => l.name === 'suite' || l.name === 'parentSuite');
    const suiteName = suiteLabel ? suiteLabel.value : (r.fullName || '').split('/')[0] || 'General';
    const mod = suiteName.replace(/test(s)?/gi, '').trim() || 'General';

    if (!moduleMap[mod]) moduleMap[mod] = { passed: 0, failed: 0, total: 0 };
    moduleMap[mod].total++;
    if (r.status === 'passed') moduleMap[mod].passed++;
    else moduleMap[mod].failed++;
  }

  return { stats, moduleMap };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function generateHtml(stats, moduleMap, results) {
  const successRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
  const rateColor = successRate >= 90 ? '#22c55e' : successRate >= 70 ? '#f59e0b' : '#ef4444';
  const execTime = formatDuration(stats.duration);

  const moduleRows = Object.entries(moduleMap).map(([mod, m]) => {
    const rate = m.total > 0 ? ((m.passed / m.total) * 100).toFixed(0) : 0;
    const barColor = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
    return `
      <tr>
        <td>${mod}</td>
        <td>${m.total}</td>
        <td style="color:#22c55e;font-weight:600">${m.passed}</td>
        <td style="color:#ef4444;font-weight:600">${m.failed}</td>
        <td>
          <div style="background:#e5e7eb;border-radius:4px;height:8px;width:100px;display:inline-block;vertical-align:middle">
            <div style="background:${barColor};width:${rate}%;height:8px;border-radius:4px"></div>
          </div>
          <span style="margin-left:6px">${rate}%</span>
        </td>
      </tr>`;
  }).join('');

  const recentRows = results.slice(0, 20).map(r => {
    const icon = r.status === 'passed' ? '✓' : r.status === 'failed' || r.status === 'broken' ? '✗' : '○';
    const color = r.status === 'passed' ? '#22c55e' : r.status === 'failed' || r.status === 'broken' ? '#ef4444' : '#94a3b8';
    const name = r.name || r.fullName || 'Unknown';
    const dur = formatDuration(r.duration || 0);
    return `
      <tr>
        <td style="color:${color};font-size:1.1em">${icon}</td>
        <td>${name.length > 60 ? name.substring(0, 57) + '...' : name}</td>
        <td style="color:${color};text-transform:capitalize">${r.status || 'unknown'}</td>
        <td>${dur}</td>
      </tr>`;
  }).join('');

  const moduleLabelArr = JSON.stringify(Object.keys(moduleMap));
  const modulePassArr = JSON.stringify(Object.values(moduleMap).map(m => m.passed));
  const moduleFailArr = JSON.stringify(Object.values(moduleMap).map(m => m.failed));
  const statusData = JSON.stringify([stats.passed, stats.failed, stats.skipped]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Test Execution Dashboard — Estimation Platform</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
    .header{background:linear-gradient(135deg,#1e293b,#0f172a);padding:24px 32px;border-bottom:1px solid #1e293b}
    .header h1{font-size:1.6rem;font-weight:700;color:#f1f5f9}
    .header p{color:#94a3b8;margin-top:4px;font-size:.9rem}
    .container{max-width:1400px;margin:0 auto;padding:24px 32px}
    .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px}
    .kpi-card{background:#1e293b;border-radius:12px;padding:20px;text-align:center;border:1px solid #334155}
    .kpi-card .value{font-size:2.2rem;font-weight:800;margin-bottom:4px}
    .kpi-card .label{font-size:.8rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
    .charts-row{display:grid;grid-template-columns:1fr 2fr;gap:20px;margin-bottom:28px}
    .chart-card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155}
    .chart-card h3{font-size:1rem;font-weight:600;margin-bottom:16px;color:#cbd5e1}
    .chart-wrap{position:relative;height:260px}
    .table-card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:20px}
    .table-card h3{font-size:1rem;font-weight:600;margin-bottom:16px;color:#cbd5e1}
    table{width:100%;border-collapse:collapse;font-size:.875rem}
    th{text-align:left;padding:10px 12px;background:#0f172a;color:#94a3b8;font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
    td{padding:10px 12px;border-top:1px solid #1e293b;color:#e2e8f0}
    tr:hover td{background:#263346}
    .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:600}
    .badge-green{background:#14532d;color:#4ade80}
    .badge-red{background:#450a0a;color:#f87171}
    .badge-yellow{background:#422006;color:#fcd34d}
    .footer{text-align:center;padding:20px;color:#475569;font-size:.8rem;border-top:1px solid #1e293b;margin-top:8px}
    .rate-badge{font-size:2.2rem;font-weight:800;color:${rateColor}}
  </style>
</head>
<body>
  <div class="header">
    <h1>🧪 Test Execution Dashboard</h1>
    <p>Estimation Platform — Selenium Automation Suite &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
  </div>

  <div class="container">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="value" style="color:#f1f5f9">${stats.total}</div>
        <div class="label">Total Tests</div>
      </div>
      <div class="kpi-card">
        <div class="value" style="color:#22c55e">${stats.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="kpi-card">
        <div class="value" style="color:#ef4444">${stats.failed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="kpi-card">
        <div class="value" style="color:#94a3b8">${stats.skipped}</div>
        <div class="label">Skipped</div>
      </div>
      <div class="kpi-card">
        <div class="rate-badge">${successRate}%</div>
        <div class="label">Success Rate</div>
      </div>
      <div class="kpi-card">
        <div class="value" style="color:#818cf8">${execTime}</div>
        <div class="label">Total Duration</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Status Distribution</h3>
        <div class="chart-wrap">
          <canvas id="statusChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <h3>Module-wise Results</h3>
        <div class="chart-wrap">
          <canvas id="moduleChart"></canvas>
        </div>
      </div>
    </div>

    <div class="table-card">
      <h3>Module Summary</h3>
      <table>
        <thead><tr><th>Module</th><th>Total</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr></thead>
        <tbody>${moduleRows || '<tr><td colspan="5" style="text-align:center;color:#475569">No data available</td></tr>'}</tbody>
      </table>
    </div>

    <div class="table-card">
      <h3>Recent Test Results (last 20)</h3>
      <table>
        <thead><tr><th>Status</th><th>Test Name</th><th>Result</th><th>Duration</th></tr></thead>
        <tbody>${recentRows || '<tr><td colspan="4" style="text-align:center;color:#475569">No results found</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <div class="footer">Estimation Platform Automation Framework &copy; ${new Date().getFullYear()}</div>

  <script>
    const statusCtx = document.getElementById('statusChart').getContext('2d');
    new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Passed', 'Failed', 'Skipped'],
        datasets: [{ data: ${statusData}, backgroundColor: ['#22c55e','#ef4444','#94a3b8'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0' } } } }
    });

    const modCtx = document.getElementById('moduleChart').getContext('2d');
    new Chart(modCtx, {
      type: 'bar',
      data: {
        labels: ${moduleLabelArr},
        datasets: [
          { label: 'Passed', data: ${modulePassArr}, backgroundColor: '#22c55e' },
          { label: 'Failed', data: ${moduleFailArr}, backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
          y: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
        },
        plugins: { legend: { labels: { color: '#e2e8f0' } } }
      }
    });
  </script>
</body>
</html>`;
}

function main() {
  console.log('Generating test execution dashboard...');
  const results = readAllureResults();
  const { stats, moduleMap } = aggregateStats(results);

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const html = generateHtml(stats, moduleMap, results);
  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');

  console.log(`Dashboard generated: ${OUTPUT_FILE}`);
  console.log(`  Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
  console.log(`  Duration: ${formatDuration(stats.duration)}`);
}

main();
