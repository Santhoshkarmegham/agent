import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type PlaywrightSpec = {
  title?: string;
  specs?: Array<{ title: string; tests: Array<{ status: string; results: Array<{ status: string; duration: number }> }> }>;
  suites?: PlaywrightSpec[];
};

type CucumberFeature = {
  name: string;
  elements?: Array<{ name: string; steps?: Array<{ result?: { status?: string; duration?: number } }> }>;
};

const safeReadJson = <T>(filePath: string, fallback: T): T => {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
};

const flattenPlaywrightSuites = (suite: PlaywrightSpec, results: Array<{ title: string; status: string; durationMs: number }>): void => {
  suite.specs?.forEach((spec) => {
    const firstResult = spec.tests[0]?.results?.[0];
    results.push({
      title: spec.title,
      status: spec.tests[0]?.status || firstResult?.status || 'unknown',
      durationMs: firstResult?.duration || 0,
    });
  });

  suite.suites?.forEach((child) => flattenPlaywrightSuites(child, results));
};

const summarizePlaywright = () => {
  const payload = safeReadJson<{ suites?: PlaywrightSpec[] }>(path.resolve(process.cwd(), 'test-results/results.json'), {});
  const tests: Array<{ title: string; status: string; durationMs: number }> = [];
  payload.suites?.forEach((suite) => flattenPlaywrightSuites(suite, tests));

  return {
    total: tests.length,
    passed: tests.filter((test) => test.status === 'expected' || test.status === 'passed').length,
    failed: tests.filter((test) => !['expected', 'passed', 'skipped'].includes(test.status)).length,
    skipped: tests.filter((test) => test.status === 'skipped').length,
    e2e: {
      total: tests.filter((test) => test.title?.includes('[E2E]')).length,
      passed: tests.filter((test) => test.title?.includes('[E2E]') && ['expected', 'passed'].includes(test.status)).length,
      failed: tests.filter((test) => test.title?.includes('[E2E]') && !['expected', 'passed', 'skipped'].includes(test.status)).length,
      skipped: tests.filter((test) => test.title?.includes('[E2E]') && test.status === 'skipped').length,
    },
    regression: {
      total: tests.filter((test) => !test.title?.includes('[E2E]')).length,
      passed: tests.filter((test) => !test.title?.includes('[E2E]') && ['expected', 'passed'].includes(test.status)).length,
      failed: tests.filter((test) => !test.title?.includes('[E2E]') && !['expected', 'passed', 'skipped'].includes(test.status)).length,
      skipped: tests.filter((test) => !test.title?.includes('[E2E]') && test.status === 'skipped').length,
    },
    tests,
  };
};

const summarizeCucumber = () => {
  const payload = safeReadJson<CucumberFeature[]>(path.resolve(process.cwd(), 'bdd-results/cucumber-report.json'), []);
  const scenarios = payload.flatMap((feature) =>
    (feature.elements || []).map((scenario) => {
      const stepStatuses = (scenario.steps || []).map((step) => step.result?.status || 'unknown');
      const status = stepStatuses.includes('failed')
        ? 'failed'
        : stepStatuses.every((value) => value === 'skipped' || value === 'pending')
          ? 'skipped'
          : 'passed';

      return {
        title: `${feature.name} / ${scenario.name}`,
        status,
      };
    })
  );

  return {
    total: scenarios.length,
    passed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    failed: scenarios.filter((scenario) => scenario.status === 'failed').length,
    skipped: scenarios.filter((scenario) => scenario.status === 'skipped').length,
    e2e: {
      total: scenarios.filter((scenario) => scenario.title.includes('E2E:')).length,
      passed: scenarios.filter((scenario) => scenario.title.includes('E2E:') && scenario.status === 'passed').length,
      failed: scenarios.filter((scenario) => scenario.title.includes('E2E:') && scenario.status === 'failed').length,
      skipped: scenarios.filter((scenario) => scenario.title.includes('E2E:') && scenario.status === 'skipped').length,
    },
    regression: {
      total: scenarios.filter((scenario) => !scenario.title.includes('E2E:')).length,
      passed: scenarios.filter((scenario) => !scenario.title.includes('E2E:') && scenario.status === 'passed').length,
      failed: scenarios.filter((scenario) => !scenario.title.includes('E2E:') && scenario.status === 'failed').length,
      skipped: scenarios.filter((scenario) => !scenario.title.includes('E2E:') && scenario.status === 'skipped').length,
    },
    scenarios,
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

const main = (): void => {
  const inventory = safeReadJson<Record<string, unknown>>(path.resolve(process.cwd(), 'artifacts/discovery/operation-inventory.json'), {});
  const nonBdd = summarizePlaywright();
  const bdd = summarizeCucumber();
  const requestLogs = readRequestLogs();
  const outputDir = path.resolve(process.cwd(), 'custom-report');
  mkdirSync(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    endpoint: 'https://rickandmortyapi.com/graphql',
    discovery: inventory,
    nonBdd,
    bdd,
    requestLogs,
    comparison: {
      bothPassed: nonBdd.failed === 0 && bdd.failed === 0,
      nonBddExecuted: nonBdd.total,
      bddExecuted: bdd.total,
    },
    customReportingLimitations: [
      'The public GraphQL API returns HTTP 200 for both successful and error responses, so the report must inspect GraphQL errors and data together.',
      'Schema discovery required several shallow introspection calls because the endpoint enforces an introspection depth limit.',
      'Allure raw result files are generated, but merged Allure HTML is not produced automatically without the Allure CLI.',
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
};

main();
