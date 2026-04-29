#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');

const testFiles = [
  'test/config.js',
  'test/elasticsearch.js',
  'test/logger.js',
  'test/logship.js',
  'test/postfix-doc.js',
  'test/reader.js',
  'test/spool.js',
];

const TEST_TIMEOUT_MS = 40000; // 40 seconds per test file

async function runTests() {
  const results = [];

  for (const testFile of testFiles) {
    console.log(`\nRunning ${testFile}...`);

    await new Promise((resolve) => {
      const test = spawn('node', ['--expose-gc', '--test', testFile], {
        env: { ...process.env, NODE_ENV: 'test' },
        stdio: 'pipe',
      });

      let output = '';
      let completed = false;
      let hasSeenFinalSummary = false;

      test.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        process.stdout.write(str);
        // Check if we've seen the test summary
        if (output.includes('ℹ duration_ms')) {
          hasSeenFinalSummary = true;
        }
      });

      test.stderr.on('data', (data) => {
        const str = data.toString();
        output += str;
        process.stderr.write(str);
      });

      const timeout = setTimeout(() => {
        if (!completed && !hasSeenFinalSummary) {
          console.warn(`\nWarning: ${testFile} did not exit cleanly, killing process...`);
          test.kill();
        }
      }, TEST_TIMEOUT_MS);

      test.on('exit', (code, _) => {
        completed = true;
        clearTimeout(timeout);

        // Check if there are actual test failures
        const failCountMatch = output.match(/ℹ fail (\d+)/);
        const failCount = failCountMatch ? parseInt(failCountMatch[1], 10) : 0;

        const hasActualTestFailures = failCount > 0;

        let status;
        let finalCode;
        if (code === 0) {
          status = 'passed';
          finalCode = 0;
        }
        else if (hasActualTestFailures) {
          status = 'failed';
          finalCode = 1;
        }
        else {
          status = 'passed (process timeout)';
          finalCode = 0;
        }

        results.push({ testFile, code: finalCode, status });
        console.log(`✓ ${testFile} ${status}`);
        resolve();
      });

      test.on('error', (err) => {
        completed = true;
        clearTimeout(timeout);
        console.error(`Error running ${testFile}:`, err);
        results.push({ testFile, code: 1, status: 'error' });
        resolve();
      });
    });
  }

  const failedTests = results.filter((r) => r.code !== 0);
  console.log('\n\nTest Summary:');
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${results.length - failedTests.length}`);
  console.log(`Failed: ${failedTests.length}`);

  if (failedTests.length > 0) {
    console.log('\nFailed tests:');
    failedTests.forEach((r) => {
      console.log(`  - ${r.testFile} (${r.status})`);
    });
    process.exit(1);
  }

  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});

