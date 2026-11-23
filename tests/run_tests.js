'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TESTS_ROOT = __dirname;
const TIER_MAP = {
  harness: path.join(TESTS_ROOT, 'harness'),
  1: path.join(TESTS_ROOT, 'tier1'),
  2: path.join(TESTS_ROOT, 'tier2'),
  3: path.join(TESTS_ROOT, 'tier3'),
  4: path.join(TESTS_ROOT, 'tier4'),
};

function printUsage() {
  console.error('Usage: node entelso-inventory/tests/run_tests.js [--tier=harness|1|2|3|4|all]');
}

function parseArgs(argv) {
  let tier = 'all';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg.startsWith('--tier=')) {
      tier = arg.slice('--tier='.length).trim();
    } else if (arg === '--tier') {
      if (i + 1 >= argv.length) {
        printUsage();
        process.exit(2);
      }
      tier = argv[++i].trim();
    } else {
      console.error(`[run_tests] Unknown argument: ${arg}`);
      printUsage();
      process.exit(2);
    }
  }
  return tier;
}

function findTestFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) return [];

  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
  results.sort();
  return results;
}

function main() {
  const tier = parseArgs(process.argv.slice(2));
  let selectedTiers;

  if (tier === 'all') {
    selectedTiers = ['harness', '1', '2', '3', '4'];
  } else if (Object.prototype.hasOwnProperty.call(TIER_MAP, tier)) {
    selectedTiers = [tier];
  } else {
    console.error(`[run_tests] Invalid --tier value: "${tier}"`);
    printUsage();
    process.exit(2);
  }

  const discovered = [];
  for (const t of selectedTiers) {
    const dir = TIER_MAP[t];
    const files = findTestFiles(dir);
    if (files.length === 0) {
      console.log(`[run_tests] Tier ${t}: 0 test files found (skipping)`);
    } else {
      console.log(`[run_tests] Tier ${t}: ${files.length} test file(s) found`);
      discovered.push(...files);
    }
  }

  if (discovered.length === 0) {
    console.log('[run_tests] No test files to execute.');
    process.exit(0);
  }

  const res = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=2', '--test-reporter=spec', ...discovered],
    {
      cwd: TESTS_ROOT,
      stdio: 'inherit',
      env: process.env,
    }
  );

  if (res.error) {
    console.error('[run_tests] Failed to launch node --test:', res.error);
    process.exit(1);
  }

  process.exit(res.status === null ? 1 : res.status);
}

main();
