import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type PlaywrightSpec = {
  title?: string;
  specs?: Array<{ title: string; tests: Array<{ status: string; results: Array<{ status: string; duration: number }> }> }>;
  suites?: PlaywrightSpec[];
};

type CucumberFeature = {
  name: string;
  elements?: Array<{
    name: string;
    tags?: Array<{ name: string }>;
    steps?: Array<{ result?: { status?: string; duration?: number } }>;
  }>;
};

type ExecutionEntry = {
  framework: 'Non-BDD' | 'BDD';
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'unknown';
  durationMs: number;
  isE2E: boolean;
};

const safeReadJson = <T>(filePath: string, fallback: T): T => {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
};

const mapPlaywrightStatus = (status: string | undefined): ExecutionEntry['status'] => {
  if (['expected', 'passed'].includes(status || '')) {
    return 'passed';
  }

  if (status === 'skipped') {
    return 'skipped';
  }

  if (status) {
    return 'failed';
  }

  return 'unknown';
};

const dedupeEntries = (entries: ExecutionEntry[]): ExecutionEntry[] => {
  return Array.from(new Map(entries.map((entry) => [`${entry.framework}:${entry.title}`, entry])).values());
};

const buildSummary = (entries: ExecutionEntry[]) => ({
  total: entries.length,
  passed: entries.filter((entry) => entry.status === 'passed').length,
  failed: entries.filter((entry) => entry.status === 'failed').length,
  skipped: entries.filter((entry) => entry.status === 'skipped').length,
});

const flattenPlaywrightSuites = (suite: PlaywrightSpec, results: ExecutionEntry[]): void => {
  suite.specs?.forEach((spec) => {
    const test = spec.tests[0];
    const durationMs = (test?.results || []).reduce((total, result) => total + (result.duration || 0), 0);
    results.push({
      framework: 'Non-BDD',
      title: spec.title,
      status: mapPlaywrightStatus(test?.status || test?.results?.at(-1)?.status),
      durationMs,
      isE2E: Boolean(spec.title?.includes('[E2E]')),
    });
  });

  suite.suites?.forEach((child) => flattenPlaywrightSuites(child, results));
};

const summarizePlaywright = () => {
  const payload = safeReadJson<{ suites?: PlaywrightSpec[] }>(path.resolve(process.cwd(), 'test-results/results.json'), {});
  const tests: ExecutionEntry[] = [];
  payload.suites?.forEach((suite) => flattenPlaywrightSuites(suite, tests));
  const entries = dedupeEntries(tests);

  return {
    ...buildSummary(entries),
    e2e: buildSummary(entries.filter((entry) => entry.isE2E)),
    regression: buildSummary(entries.filter((entry) => !entry.isE2E)),
    tests: entries,
  };
};

const summarizeCucumber = () => {
  const payload = safeReadJson<CucumberFeature[]>(path.resolve(process.cwd(), 'bdd-results/cucumber-report.json'), []);
  const scenarios = payload.flatMap((feature) =>
    (feature.elements || []).map((scenario) => {
      const stepStatuses = (scenario.steps || []).map((step) => step.result?.status || 'unknown');
      const totalDurationNs = (scenario.steps || []).reduce((total, step) => total + (step.result?.duration || 0), 0);
      const status: ExecutionEntry['status'] = stepStatuses.some((value) => ['failed', 'ambiguous', 'undefined'].includes(value))
        ? 'failed'
        : stepStatuses.length > 0 && stepStatuses.every((value) => value === 'passed')
          ? 'passed'
          : stepStatuses.every((value) => value === 'skipped' || value === 'pending')
          ? 'skipped'
          : 'unknown';

      return {
        framework: 'BDD' as const,
        title: `${feature.name} / ${scenario.name}`,
        status,
        durationMs: Math.round(totalDurationNs / 1_000_000),
        isE2E: Boolean((scenario.tags || []).some((tag) => tag.name === '@e2e-new')),
      };
    })
  );
  const entries = dedupeEntries(scenarios);

  return {
    ...buildSummary(entries),
    e2e: buildSummary(entries.filter((entry) => entry.isE2E)),
    regression: buildSummary(entries.filter((entry) => !entry.isE2E)),
    scenarios: entries,
  };
};

const readRequestLogs = () => {
  const directory = path.resolve(process.cwd(), 'artifacts/request-logs');
  if (!existsSync(directory)) {
    return [] as Array<Record<string, unknown>>;
  }

  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.jsonl'))
    .flatMap((fileName) =>
      readFileSync(path.join(directory, fileName), 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    );
};

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const statusClassName = (status: ExecutionEntry['status']): string => {
  switch (status) {
    case 'passed':
      return 'status-passed';
    case 'failed':
      return 'status-failed';
    case 'skipped':
      return 'status-skipped';
    default:
      return 'status-unknown';
  }
};

const renderSummaryCard = (title: string, summary: { total: number; passed: number; failed: number; skipped: number }): string => `
  <section class="card summary-card">
    <h3>${escapeHtml(title)}</h3>
    <div class="summary-metrics">
      <div><span class="metric-value">${summary.total}</span><span class="metric-label">Total</span></div>
      <div><span class="metric-value success">${summary.passed}</span><span class="metric-label">Passed</span></div>
      <div><span class="metric-value danger">${summary.failed}</span><span class="metric-label">Failed</span></div>
      <div><span class="metric-value muted">${summary.skipped}</span><span class="metric-label">Skipped</span></div>
    </div>
  </section>`;

const renderExecutionTable = (entries: ExecutionEntry[]): string => {
  if (entries.length === 0) {
    return '<p class="empty-state">No execution entries were recorded.</p>';
  }

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Framework</th>
            <th>Title</th>
            <th>Status</th>
            <th>Duration (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry) => `
                <tr>
                  <td>${escapeHtml(entry.framework)}</td>
                  <td>${escapeHtml(entry.title)}</td>
                  <td><span class="status-pill ${statusClassName(entry.status)}">${escapeHtml(entry.status)}</span></td>
                  <td>${entry.durationMs}</td>
                </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
};

const renderRequestLogTable = (entries: Array<Record<string, unknown>>): string => {
  if (entries.length === 0) {
    return '<p class="empty-state">No request logs were captured.</p>';
  }

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Runner</th>
            <th>Operation</th>
            <th>HTTP status</th>
            <th>Response time (ms)</th>
            <th>GraphQL errors</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map((entry) => {
              const graphqlErrors = Array.isArray(entry.graphqlErrors) ? entry.graphqlErrors.length : 0;

              return `
                <tr>
                  <td>${escapeHtml(entry.runner ?? '-')}</td>
                  <td>${escapeHtml(entry.operationName ?? '-')}</td>
                  <td>${escapeHtml(entry.httpStatus ?? '-')}</td>
                  <td>${escapeHtml(entry.responseTimeMs ?? '-')}</td>
                  <td>${graphqlErrors}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
};

const buildStandaloneHtml = (report: {
  generatedAt: string;
  endpoint: string;
  discovery: Record<string, unknown>;
  nonBdd: ReturnType<typeof summarizePlaywright>;
  bdd: ReturnType<typeof summarizeCucumber>;
  consolidatedE2E: { total: number; passed: number; failed: number; skipped: number; entries: ExecutionEntry[] };
  requestLogs: Array<Record<string, unknown>>;
  comparison: { bothPassed: boolean; nonBddExecuted: number; bddExecuted: number };
  allure: { mergedResultsDirectory: string; htmlReportDirectory: string };
  customReportingLimitations: string[];
}): string => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GraphQL execution report</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0b1020;
        --panel: #121933;
        --panel-soft: #18203f;
        --text: #eef2ff;
        --muted: #a8b3cf;
        --border: #2c3860;
        --success: #22c55e;
        --danger: #ef4444;
        --warning: #f59e0b;
        --unknown: #94a3b8;
        --accent: #60a5fa;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Arial, sans-serif;
        background: linear-gradient(180deg, #0b1020 0%, #111936 100%);
        color: var(--text);
      }

      .page {
        max-width: 1280px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      .hero, .card {
        background: rgba(18, 25, 51, 0.92);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
      }

      .hero {
        padding: 28px;
        margin-bottom: 24px;
      }

      h1, h2, h3 { margin: 0 0 12px; }
      h1 { font-size: 2rem; }
      h2 { font-size: 1.25rem; margin-bottom: 16px; }
      h3 { font-size: 1rem; }
      p, li { color: var(--muted); line-height: 1.55; }

      .hero-grid,
      .summary-grid,
      .meta-grid {
        display: grid;
        gap: 16px;
      }

      .hero-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 20px; }
      .summary-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
      .meta-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }

      .card { padding: 20px; margin-top: 20px; }

      .meta-item {
        background: rgba(24, 32, 63, 0.9);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
      }

      .meta-label,
      .metric-label {
        display: block;
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .meta-value,
      .metric-value {
        display: block;
        margin-top: 6px;
        font-weight: 700;
        font-size: 1.3rem;
        color: var(--text);
      }

      .summary-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .success { color: var(--success); }
      .danger { color: var(--danger); }
      .muted { color: var(--unknown); }
      .accent { color: var(--accent); }

      .status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: capitalize;
      }

      .status-passed { background: rgba(34, 197, 94, 0.18); color: #86efac; }
      .status-failed { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
      .status-skipped { background: rgba(245, 158, 11, 0.18); color: #fcd34d; }
      .status-unknown { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; }

      .table-wrapper {
        overflow-x: auto;
        border: 1px solid var(--border);
        border-radius: 14px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 720px;
      }

      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }

      th {
        background: rgba(96, 165, 250, 0.08);
        color: var(--text);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      tr:last-child td { border-bottom: 0; }

      code, pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      pre {
        margin: 0;
        padding: 16px;
        background: rgba(8, 13, 28, 0.95);
        border: 1px solid var(--border);
        border-radius: 14px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #dbeafe;
      }

      .empty-state {
        margin: 0;
        padding: 14px 16px;
        border: 1px dashed var(--border);
        border-radius: 14px;
      }

      ul { margin: 0; padding-left: 20px; }

      @media (max-width: 720px) {
        .page { padding: 20px 14px 32px; }
        .hero, .card { padding: 18px; border-radius: 16px; }
        h1 { font-size: 1.6rem; }
        table { min-width: 620px; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <h1>GraphQL execution report</h1>
        <p>Standalone downloadable HTML report for the GraphQL automation pack. This file is self-contained and does not depend on external CSS, JavaScript, or report assets.</p>
        <div class="hero-grid">
          <div class="meta-item">
            <span class="meta-label">Endpoint</span>
            <span class="meta-value">${escapeHtml(report.endpoint)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Generated at</span>
            <span class="meta-value">${escapeHtml(report.generatedAt)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Overall status</span>
            <span class="meta-value ${report.comparison.bothPassed ? 'success' : 'danger'}">${report.comparison.bothPassed ? 'Passed' : 'Attention needed'}</span>
          </div>
        </div>
      </section>

      <section class="summary-grid">
        ${renderSummaryCard('Non-BDD coverage', report.nonBdd)}
        ${renderSummaryCard('BDD coverage', report.bdd)}
        ${renderSummaryCard('Consolidated E2E', report.consolidatedE2E)}
      </section>

      <section class="card">
        <h2>Artifacts</h2>
        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Merged Allure results</span>
            <span class="meta-value accent">${escapeHtml(report.allure.mergedResultsDirectory)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Allure HTML directory</span>
            <span class="meta-value accent">${escapeHtml(report.allure.htmlReportDirectory)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Executed tests</span>
            <span class="meta-value">${report.comparison.nonBddExecuted + report.comparison.bddExecuted}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Consolidated E2E entries</h2>
        ${renderExecutionTable(report.consolidatedE2E.entries)}
      </section>

      <section class="card">
        <h2>Non-BDD test entries</h2>
        ${renderExecutionTable(report.nonBdd.tests)}
      </section>

      <section class="card">
        <h2>BDD scenario entries</h2>
        ${renderExecutionTable(report.bdd.scenarios)}
      </section>

      <section class="card">
        <h2>Request log sample</h2>
        ${renderRequestLogTable(report.requestLogs.slice(0, 25))}
      </section>

      <section class="card">
        <h2>Discovery snapshot</h2>
        <pre>${escapeHtml(JSON.stringify(report.discovery, null, 2))}</pre>
      </section>

      <section class="card">
        <h2>Reporting limitations</h2>
        <ul>
          ${report.customReportingLimitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>
    </main>
  </body>
</html>`;

const main = (): void => {
  const inventory = safeReadJson<Record<string, unknown>>(path.resolve(process.cwd(), 'artifacts/discovery/operation-inventory.json'), {});
  const nonBdd = summarizePlaywright();
  const bdd = summarizeCucumber();
  const requestLogs = readRequestLogs();
  const consolidatedEntries = dedupeEntries([...nonBdd.tests, ...bdd.scenarios]);
  const consolidatedE2E = consolidatedEntries.filter((entry) => entry.isE2E);
  const outputDir = path.resolve(process.cwd(), 'custom-report');
  mkdirSync(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    endpoint: 'https://rickandmortyapi.com/graphql',
    discovery: inventory,
    nonBdd,
    bdd,
    consolidatedE2E: {
      ...buildSummary(consolidatedE2E),
      entries: consolidatedE2E,
    },
    requestLogs,
    comparison: {
      bothPassed: nonBdd.failed === 0 && bdd.failed === 0,
      nonBddExecuted: nonBdd.total,
      bddExecuted: bdd.total,
    },
    allure: {
      mergedResultsDirectory: 'artifacts/allure-results-merged',
      htmlReportDirectory: 'allure-report',
    },
    customReportingLimitations: [
      'The public GraphQL API returns HTTP 200 for both successful and error responses, so the report must inspect GraphQL errors and data together.',
      'Schema discovery required several shallow introspection calls because the endpoint enforces an introspection depth limit.',
      'Merged Allure results are prepared automatically; HTML generation runs when the Allure CLI is available locally.',
    ],
  };

  writeFileSync(path.join(outputDir, 'graphql-execution-report.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(
    path.join(outputDir, 'graphql-execution-report.md'),
    [
      '# GraphQL execution report',
      '',
      `- Endpoint: ${report.endpoint}`,
      `- Generated at: ${report.generatedAt}`,
      `- Non-BDD: ${nonBdd.passed} passed / ${nonBdd.failed} failed / ${nonBdd.skipped} skipped (${nonBdd.total} total)` ,
      `- BDD: ${bdd.passed} passed / ${bdd.failed} failed / ${bdd.skipped} skipped (${bdd.total} total)`,
      `- New E2E Non-BDD: ${nonBdd.e2e.passed} passed / ${nonBdd.e2e.failed} failed / ${nonBdd.e2e.skipped} skipped (${nonBdd.e2e.total} total)`,
      `- New E2E BDD: ${bdd.e2e.passed} passed / ${bdd.e2e.failed} failed / ${bdd.e2e.skipped} skipped (${bdd.e2e.total} total)`,
      `- Existing regression Non-BDD: ${nonBdd.regression.passed} passed / ${nonBdd.regression.failed} failed / ${nonBdd.regression.skipped} skipped (${nonBdd.regression.total} total)`,
      `- Existing regression BDD: ${bdd.regression.passed} passed / ${bdd.regression.failed} failed / ${bdd.regression.skipped} skipped (${bdd.regression.total} total)`,
      `- Allure results: ${report.allure.mergedResultsDirectory}`,
      `- Allure HTML: ${report.allure.htmlReportDirectory}`,
      '',
      '## Consolidated E2E entries',
      ...consolidatedE2E.map((entry) => `- [${entry.framework}] ${entry.title}: ${entry.status}, ${entry.durationMs}ms`),
      '',
      '## Request log sample',
      ...requestLogs.slice(0, 10).map((entry) => `- [${entry.runner}] ${entry.operationName}: HTTP ${entry.httpStatus}, ${entry.responseTimeMs}ms, errors=${Array.isArray(entry.graphqlErrors) ? entry.graphqlErrors.length : 0}`),
      '',
      '## Reporting limitations',
      ...report.customReportingLimitations.map((item) => `- ${item}`),
      '',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(path.join(outputDir, 'graphql-execution-report.html'), buildStandaloneHtml(report), 'utf-8');
};

main();
