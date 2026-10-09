// packages/vscode-sfl/src/extension.ts
//
// Activation entry (the "extension" half of the client/server split). It
// spawns the language server (./server/server.js) over IPC and registers it
// against .sfl documents — all the actual language logic lives server-side
// (see src/server/server.ts), so the same server could later be pointed at
// any other LSP-capable editor. The one client-side feature is the
// "Apply Style Template" command (./templates/), a VS Code UI action.

import * as path from 'path';
import { ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { registerStyleTemplateCommand } from './templates/command';

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  registerStyleTemplateCommand(context);

  const serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'sfl' }],
  };

  client = new LanguageClient('sflLanguageServer', 'SFL Language Server', serverOptions, clientOptions);
  context.subscriptions.push({ dispose: () => void client?.stop() });
  void client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
