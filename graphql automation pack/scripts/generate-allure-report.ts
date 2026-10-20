import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { loadEnvironmentConfig } from '../src/config/env';

type SourceBundle = {
  name: 'shared' | 'bdd-legacy' | 'non-bdd-legacy';
  directory: string;
};

type GenerationSummary = {
  generatedAt: string;
  mergedResultsDirectory: string;
  htmlReportDirectory: string;
  sources: Array<{
    name: SourceBundle['name'];
    relativeDirectory: string;
    fileCount: number;
    copiedFiles: string[];
  }>;
  htmlReportGenerated: boolean;
  htmlGenerator: string | null;
};

const environment = loadEnvironmentConfig();
const rootDirectory = process.cwd();
const mergedResultsDirectory = path.resolve(rootDirectory, 'artifacts/allure-results-merged');
const htmlReportDirectory = path.resolve(rootDirectory, 'allure-report');

const sourceBundles: SourceBundle[] = [
  { name: 'shared', directory: path.resolve(rootDirectory, 'allure-results') },
  { name: 'non-bdd-legacy', directory: path.resolve(rootDirectory, 'allure-results/non-bdd') },
  { name: 'bdd-legacy', directory: path.resolve(rootDirectory, 'allure-results/bdd') },
];

const cleanDirectory = (directory: string): void => {
  if (existsSync(directory)) {
    rmSync(directory, { recursive: true, force: true });
  }

  mkdirSync(directory, { recursive: true });
};

const copyBundleFiles = (bundle: SourceBundle) => {
  if (!existsSync(bundle.directory)) {
    return {
      name: bundle.name,
      relativeDirectory: path.relative(rootDirectory, bundle.directory),
      fileCount: 0,
      copiedFiles: [] as string[],
    };
  }

  const copiedFiles: string[] = [];

  for (const entry of readdirSync(bundle.directory)) {
    const sourcePath = path.join(bundle.directory, entry);
    if (!statSync(sourcePath).isFile()) {
      continue;
    }

    if (path.resolve(sourcePath) === path.resolve(path.join(mergedResultsDirectory, entry))) {
      continue;
    }

    const targetFileName = existsSync(path.join(mergedResultsDirectory, entry)) ? `${bundle.name}-${entry}` : entry;
    copyFileSync(sourcePath, path.join(mergedResultsDirectory, targetFileName));
    copiedFiles.push(targetFileName);
  }

  return {
    name: bundle.name,
    relativeDirectory: path.relative(rootDirectory, bundle.directory),
    fileCount: copiedFiles.length,
    copiedFiles,
  };
};

const writeAllureMetadata = (): void => {
  const environmentProperties = [
    `BaseURL=${environment.baseURL}`,
    `GraphQLPath=${environment.graphqlPath}`,
    `Environment=${process.env.TEST_ENV || 'qa'}`,
    'Pack=GraphQL Automation Pack',
    'Runners=playwright,cucumber',
  ].join('\n');

  writeFileSync(path.join(mergedResultsDirectory, 'environment.properties'), `${environmentProperties}\n`, 'utf-8');
  writeFileSync(
    path.join(mergedResultsDirectory, 'executor.json'),
    JSON.stringify(
      {
        name: 'GraphQL Automation Pack',
        type: 'local',
        buildName: 'graphql-automation-pack',
        reportName: 'GraphQL Allure Report',
      },
      null,
      2
    ),
    'utf-8'
  );
  writeFileSync(
    path.join(mergedResultsDirectory, 'categories.json'),
    JSON.stringify(
      [
        {
          name: 'GraphQL validation failures',
          matchedStatuses: ['failed'],
          messageRegex: '.*GraphQL.*|.*graphql.*',
        },
        {
          name: 'Network and transport failures',
          matchedStatuses: ['broken'],
          messageRegex: '.*ECONN.*|.*timeout.*|.*socket.*',
        },
      ],
      null,
      2
    ),
    'utf-8'
  );
};

const findAllureGenerator = (): { command: string; argsPrefix: string[] } | null => {
  const localBinary = path.resolve(rootDirectory, 'node_modules/.bin/allure');

  if (existsSync(localBinary)) {
    return { command: localBinary, argsPrefix: [] };
  }

  const globalCheck = spawnSync('allure', ['--version'], { stdio: 'ignore' });
  if (globalCheck.status === 0) {
    return { command: 'allure', argsPrefix: [] };
  }

  return null;
};

const writeFallbackArtifacts = (summary: GenerationSummary): void => {
  mkdirSync(htmlReportDirectory, { recursive: true });
  writeFileSync(path.join(htmlReportDirectory, 'allure-report-manifest.json'), JSON.stringify(summary, null, 2), 'utf-8');
  writeFileSync(
    path.join(htmlReportDirectory, 'README.md'),
    [
      '# Allure report artifacts',
      '',
      'The GraphQL pack now prepares a merged Allure result set automatically.',
      '',
      `- Merged results: ${path.relative(rootDirectory, mergedResultsDirectory)}`,
      '- HTML generation: skipped because no local Allure CLI binary was found.',
      '',
      'To generate the HTML report later, install the Allure CLI and run:',
      '',
      '```bash',
      'allure generate artifacts/allure-results-merged --clean -o allure-report',
      '```',
      '',
    ].join('\n'),
    'utf-8'
  );
};

const summarizeExistingResults = () => {
  const testResultsPath = path.resolve(rootDirectory, 'test-results/results.json');
  const bddResultsPath = path.resolve(rootDirectory, 'bdd-results/cucumber-report.json');

  return {
    hasPlaywrightResults: existsSync(testResultsPath),
    hasCucumberResults: existsSync(bddResultsPath),
    playwrightBytes: existsSync(testResultsPath) ? readFileSync(testResultsPath).byteLength : 0,
    cucumberBytes: existsSync(bddResultsPath) ? readFileSync(bddResultsPath).byteLength : 0,
  };
};

const main = (): void => {
  cleanDirectory(mergedResultsDirectory);
  cleanDirectory(htmlReportDirectory);

  const sources = sourceBundles.map(copyBundleFiles);
  writeAllureMetadata();

  const generator = findAllureGenerator();
  let htmlReportGenerated = false;

  if (generator) {
    const generation = spawnSync(
      generator.command,
      [...generator.argsPrefix, 'generate', mergedResultsDirectory, '--clean', '-o', htmlReportDirectory],
      { stdio: 'inherit' }
    );

    if (generation.status !== 0) {
      throw new Error('Allure CLI execution failed while generating the HTML report.');
    }

    htmlReportGenerated = true;
  }

  const summary: GenerationSummary = {
    generatedAt: new Date().toISOString(),
    mergedResultsDirectory: path.relative(rootDirectory, mergedResultsDirectory),
    htmlReportDirectory: path.relative(rootDirectory, htmlReportDirectory),
    sources,
    htmlReportGenerated,
    htmlGenerator: generator?.command ?? null,
  };

  writeFileSync(path.join(mergedResultsDirectory, 'generation-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  writeFileSync(
    path.join(mergedResultsDirectory, 'result-inventory.json'),
    JSON.stringify(summarizeExistingResults(), null, 2),
    'utf-8'
  );

  if (!htmlReportGenerated) {
    writeFallbackArtifacts(summary);
  }
};

main();
