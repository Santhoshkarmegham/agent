import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const resultsPath = 'playwright-report/results.json';
const outputPath = 'playwright-report/forgeqe-report.html';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function walkSuites(suites, callback) {
  for (const suite of suites ?? []) {
    if (suite.specs?.length) {
      for (const spec of suite.specs) {
        callback(spec, suite);
      }
    }

    if (suite.suites?.length) {
      walkSuites(suite.suites, callback);
    }
  }
}

function collectSummary(results) {
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    durationMs: 0,
    failures: [],
  };

  walkSuites(results.suites, (spec, suite) => {
    for (const test of spec.tests ?? []) {
      summary.total += 1;

      const actualResults = test.results ?? [];
      summary.durationMs += actualResults.reduce((sum, result) => sum + (result.duration ?? 0), 0);

      const status = test.outcome ?? test.status ?? 'unknown';

      if (status === 'expected' || status === 'passed') {
        summary.passed += 1;
      } else if (status === 'flaky') {
        summary.flaky += 1;
      } else if (status === 'skipped') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;

        const lastResult = [...actualResults].reverse().find((result) => result.error);
        summary.failures.push({
          title: test.title ?? spec.title ?? 'Unnamed test',
          file: spec.file ?? suite.file ?? 'unknown',
          message: lastResult?.error?.message ?? 'No error message captured.',
        });
      }
    }
  });

  return summary;
}

function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

mkdirSync(dirname(outputPath), { recursive: true });

const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;

if (!existsSync(resultsPath)) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ForgeQE pipeline report</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; color: #1f2937; }
      .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 1.25rem; max-width: 900px; }
      h1 { margin-top: 0; }
      .warn { color: #92400e; background: #fef3c7; padding: 0.75rem 1rem; border-radius: 8px; }
      a { color: #2563eb; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>ForgeQE pipeline report</h1>
      <p class="warn">Playwright results JSON was not found, so the standalone summary could not be built.</p>
      ${runUrl ? `<p>Workflow run: <a href="${escapeHtml(runUrl)}">${escapeHtml(runUrl)}</a></p>` : ''}
    </div>
  </body>
</html>`;

  writeFileSync(outputPath, html, 'utf8');
  process.exit(0);
}

const rawResults = readFileSync(resultsPath, 'utf8');
const results = JSON.parse(rawResults);
const summary = collectSummary(results);

const failureItems = summary.failures.length
  ? `<h2>Failed tests</h2><ul>${summary.failures
      .map(
        (failure) => `<li><strong>${escapeHtml(failure.title)}</strong><br/><code>${escapeHtml(failure.file)}</code><pre>${escapeHtml(failure.message)}</pre></li>`
      )
      .join('')}</ul>`
  : '<h2>Failed tests</h2><p>No failed tests.</p>';

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ForgeQE pipeline report</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; color: #111827; background: #f9fafb; }
      .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      h1, h2 { margin-top: 0; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; }
      .stat { background: #f3f4f6; border-radius: 10px; padding: 0.9rem; }
      .label { color: #6b7280; font-size: 0.9rem; }
      .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.2rem; }
      .success { color: #166534; }
      .danger { color: #991b1b; }
      .warn { color: #92400e; }
      a { color: #2563eb; }
      pre { white-space: pre-wrap; word-break: break-word; background: #111827; color: #f9fafb; padding: 0.75rem; border-radius: 10px; overflow-x: auto; }
      code { background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 6px; }
      ul { padding-left: 1.2rem; }
      li { margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>ForgeQE pipeline report</h1>
      <p>This is the single-file HTML summary for the Playwright pipeline run.</p>
      <div class="stats">
        <div class="stat"><div class="label">Total</div><div class="value">${summary.total}</div></div>
        <div class="stat"><div class="label">Passed</div><div class="value success">${summary.passed}</div></div>
        <div class="stat"><div class="label">Failed</div><div class="value danger">${summary.failed}</div></div>
        <div class="stat"><div class="label">Flaky</div><div class="value warn">${summary.flaky}</div></div>
        <div class="stat"><div class="label">Skipped</div><div class="value">${summary.skipped}</div></div>
        <div class="stat"><div class="label">Duration</div><div class="value">${escapeHtml(formatDuration(summary.durationMs))}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Links</h2>
      <ul>
        <li><a href="index.html">Open the full Playwright HTML report</a></li>
        ${runUrl ? `<li><a href="${escapeHtml(runUrl)}">Open the GitHub Actions run</a></li>` : ''}
      </ul>
    </div>
    <div class="card">
      ${failureItems}
    </div>
  </body>
</html>`;

writeFileSync(outputPath, html, 'utf8');
