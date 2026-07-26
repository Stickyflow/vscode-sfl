import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { buildDocumentModel } from '../documentModel';
import { computeFormatting } from '../features/formatting';

function doc(text: string) {
  return TextDocument.create('file:///sample.sfl', 'sfl', 1, text);
}

describe('formatting (Format Document)', () => {
  it('reformats a messily-indented but valid document to the canonical form', () => {
    const text = `sfl 1.2
Entity a {
      text: "A"
    kind: process
}
`;
    const model = buildDocumentModel(text);
    const edits = computeFormatting(model, doc(text));
    expect(edits).toHaveLength(1);
    expect(edits[0].newText).toBe('sfl 1.2\n\nEntity a {\n  kind: process\n  text: "A"\n}\n');
  });

  it('is a no-op (no edits) on an already-canonical document', () => {
    const text = 'sfl 1.2\n\nEntity a {\n  kind: process\n  text: "A"\n}\n';
    const model = buildDocumentModel(text);
    expect(computeFormatting(model, doc(text))).toEqual([]);
  });

  it('refuses to format a document with a real syntax error, to avoid deleting the broken line', () => {
    const text = 'sfl 1.2\n\nEntity a {\n  text "A"\n}\n'; // missing ':'
    const model = buildDocumentModel(text);
    expect(model.parseErrors.length).toBeGreaterThan(0);
    expect(computeFormatting(model, doc(text))).toEqual([]);
  });
});
