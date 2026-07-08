// packages/vscode-sfl/src/server/server.ts
//
// LSP entry point. Wires the document manager to the feature providers under
// ./features/. Deliberately no server-side model cache: buildDocumentModel()
// (parse + resolve) is cheap for the small, single-file documents SFL is
// designed around (§1 — "human-readable" is a design goal), so every request
// just recomputes from the live TextDocument rather than tracking cache
// invalidation across edits.

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { buildDocumentModel, type DocumentModel } from './documentModel';
import { computeDiagnostics } from './features/diagnostics';
import { computeCompletions } from './features/completion';
import { computeHover } from './features/hover';
import { computeDefinition } from './features/definition';
import { computePrepareRename, computeRename } from './features/rename';
import { computeSemanticTokens, SEMANTIC_TOKEN_LEGEND } from './features/semanticTokens';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

function modelForUri(uri: string): DocumentModel {
  const doc = documents.get(uri);
  if (!doc) return { doc: null, parseErrors: [], resolveResult: null };
  return buildDocumentModel(doc.getText());
}

connection.onInitialize((_params: InitializeParams): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: [':', ' '] },
    hoverProvider: true,
    definitionProvider: true,
    renameProvider: { prepareProvider: true },
    semanticTokensProvider: {
      legend: SEMANTIC_TOKEN_LEGEND,
      full: true,
    },
  },
}));

documents.onDidChangeContent((change) => {
  const model = buildDocumentModel(change.document.getText());
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics: computeDiagnostics(model) });
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return computeCompletions(modelForUri(params.textDocument.uri), doc.getText(), params.position);
});

connection.onHover((params) => computeHover(modelForUri(params.textDocument.uri), params.position) ?? null);

connection.onDefinition((params) =>
  computeDefinition(modelForUri(params.textDocument.uri), params.textDocument.uri, params.position) ?? null);

connection.onPrepareRename((params) =>
  computePrepareRename(modelForUri(params.textDocument.uri), params.position) ?? null);

connection.onRenameRequest((params) =>
  computeRename(modelForUri(params.textDocument.uri), params.textDocument.uri, params.position, params.newName) ?? null);

connection.languages.semanticTokens.on((params) => computeSemanticTokens(modelForUri(params.textDocument.uri)));

documents.listen(connection);
connection.listen();
