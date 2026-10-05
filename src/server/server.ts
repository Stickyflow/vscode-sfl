// packages/vscode-sfl/src/server/server.ts
//
// LSP entry point. Wires the document manager to the feature providers under
// ./features/. The parsed model is cached per document and keyed by its LSP
// version: one keystroke triggers diagnostics, semantic tokens, completion
// and often hover, and they all share a single parse + resolve instead of
// each redoing it. TextDocument versions only ever increase, so a version
// match is the whole invalidation story.

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
import { computeDocumentSymbols } from './features/documentSymbols';
import { computeReferences } from './features/references';
import { computeFormatting } from './features/formatting';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const modelCache = new Map<string, { version: number; model: DocumentModel }>();

function modelFor(doc: TextDocument): DocumentModel {
  const cached = modelCache.get(doc.uri);
  if (cached && cached.version === doc.version) return cached.model;
  const model = buildDocumentModel(doc.getText());
  modelCache.set(doc.uri, { version: doc.version, model });
  return model;
}

function modelForUri(uri: string): DocumentModel {
  const doc = documents.get(uri);
  if (!doc) return { doc: null, parseErrors: [], resolveResult: null };
  return modelFor(doc);
}

connection.onInitialize((_params: InitializeParams): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: [':', ' '] },
    hoverProvider: true,
    definitionProvider: true,
    renameProvider: { prepareProvider: true },
    documentSymbolProvider: true,
    referencesProvider: true,
    documentFormattingProvider: true,
    semanticTokensProvider: {
      legend: SEMANTIC_TOKEN_LEGEND,
      full: true,
    },
  },
}));

documents.onDidChangeContent((change) => {
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics: computeDiagnostics(modelFor(change.document)) });
});

// Without this, closing a .sfl file that had errors leaves those diagnostics
// in the Problems panel forever — nothing else ever tells VS Code to clear
// them for a uri it stops tracking.
documents.onDidClose((event) => {
  modelCache.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
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

connection.onDocumentSymbol((params) => computeDocumentSymbols(modelForUri(params.textDocument.uri)));

connection.onReferences((params) =>
  computeReferences(modelForUri(params.textDocument.uri), params.textDocument.uri, params) ?? null);

connection.onDocumentFormatting((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return computeFormatting(modelForUri(params.textDocument.uri), doc);
});

documents.listen(connection);
connection.listen();
