// packages/vscode-sfl/src/test/runTest.ts
//
// Entry point for the *integration* test suite: downloads/launches a real
// VS Code instance (via @vscode/test-electron) with this extension loaded,
// and opens the repo's shared fixtures as the workspace. This is the layer
// the 39 vitest unit tests can't cover — they exercise the ported parser and
// feature logic as plain functions, never through an actual extension host,
// language client/server IPC transport, or VS Code's own command dispatch.
//
// Run via `npm run test:integration` (separate from `npm test`, which runs
// the vitest unit suite).

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    // Open the repo's shared fixtures as the test workspace — real, valid
    // SFL 1.2 documents already used by the unit tests.
    const workspacePath = path.resolve(__dirname, '../../../../fixtures/valid');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath, '--disable-extensions'],
    });
  } catch (err) {
    console.error('Failed to run integration tests');
    console.error(err);
    process.exit(1);
  }
}

main();
