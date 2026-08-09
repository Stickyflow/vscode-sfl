// packages/vscode-sfl/src/test/suite/extension.test.ts
//
// Real end-to-end smoke tests, running inside an actual VS Code instance
// with the extension loaded. Deliberately small and focused on the things
// only this layer can catch: activation, and the client<->server LSP
// transport actually round-tripping (a wiring bug here wouldn't show up in
// the unit tests, which call the feature functions directly and never touch
// vscode-languageclient/vscode-languageserver IPC).

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const fixturePath = path.resolve(__dirname, '../../../fixtures/valid/checkout-flow.sfl');

async function waitFor<T>(get: () => T | Thenable<T>, ok: (value: T) => boolean, timeoutMs = 10000): Promise<T> {
  const start = Date.now();
  let value = await get();
  while (!ok(value) && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    value = await get();
  }
  return value;
}

suite('SFL extension (integration)', () => {
  test('activates and registers the sfl language on a .sfl file', async () => {
    const doc = await vscode.workspace.openTextDocument(fixturePath);
    await vscode.window.showTextDocument(doc);
    assert.strictEqual(doc.languageId, 'sfl');

    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'vscode-sfl');
    assert.ok(ext, 'extension should be discoverable by package name');

    await waitFor(() => ext!.isActive, (active) => active === true);
    assert.strictEqual(ext!.isActive, true, 'extension should activate on a .sfl document');
  });

  test('language server reports a diagnostic for a duplicate name', async () => {
    const uri = vscode.Uri.parse('untitled:duplicate-name-test.sfl');
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(doc, 'sfl');
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit((edit) => {
      edit.insert(
        new vscode.Position(0, 0),
        'sfl 1.2\n\nEntity a {\n  text: "A"\n}\n\nEntity a {\n  text: "B"\n}\n',
      );
    });

    const diagnostics = await waitFor(
      () => vscode.languages.getDiagnostics(doc.uri),
      (d) => d.length > 0,
    );
    assert.ok(diagnostics.length > 0, 'expected at least one diagnostic for a duplicate name');
    assert.ok(diagnostics.some((d) => /duplicate name/i.test(d.message)), 'expected a duplicate-name diagnostic specifically');
  });

  test('hover on the Entity keyword returns documentation via the real LSP round-trip', async () => {
    const doc = await vscode.workspace.openTextDocument(fixturePath);
    await vscode.window.showTextDocument(doc);
    const text = doc.getText();
    const idx = text.indexOf('Entity ');
    assert.ok(idx >= 0, 'fixture should contain at least one Entity block');
    const pos = doc.positionAt(idx);

    const hovers = await waitFor(
      () => vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, pos),
      (h) => !!h && h.length > 0,
    );
    assert.ok(hovers && hovers.length > 0, 'expected at least one hover result on the Entity keyword');
  });
});
