// packages/vscode-sfl/src/server/sfl-core/parser.ts
//
// Ported from frontend/src/features/sfl-language/sfl/parser.ts (SFL 1.2),
// with one addition: every node an editor feature needs to point at (the
// block-kind keyword, block names, each composition-list reference,
// property keys, ident/endpoint path segments) now also records a source
// SflRange, converted from the lexer's 1-based Token.line/col to 0-based LSP
// positions via `tokenRange()`. The grammar and control flow are otherwise
// unchanged from the original.
//
// Two semantic rules are wired in here:
//   • `from`/`to` are read as endpoints (path [ "," side [ "(" fraction ")" ] ], §10/§16);
//     any other value is an ordinary value (keyword/path share `ident`, §6).
//   • `layout { … }` / `style { … }` are their own sub-blocks, distinguished
//     from a same-named property by whether `{` or `:` follows.
// Properties terminate at end-of-line OR at `;` (§5) — both are valid, even
// mixed within the same block.
//
// Spec: §17 (Grammatik).

import {
  type SflDocument, type SflBlock, type SflEntry, type SflProperty,
  type SflLayout, type SflStyle, type SflValue, type SflValue as V, type SflRange,
  isBlockKind, isSide, type Side,
} from './ast';
import { tokenize, type Token, type TokenType } from './lexer';

export class SflParseError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`SFL parse error (${line}:${col}): ${message}`);
    this.name = 'SflParseError';
  }
}

export function parse(input: string): SflDocument {
  return new Parser(tokenize(input)).parseDocument();
}

/** Converts a single-line token's 1-based line/col into a 0-based LSP Range spanning its lexeme. */
function tokenRange(tok: Token): SflRange {
  const line = tok.line - 1;
  const startChar = tok.col - 1;
  return {
    start: { line, character: startChar },
    end: { line, character: startChar + tok.value.length },
  };
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(o = 0): Token { return this.tokens[Math.min(this.pos + o, this.tokens.length - 1)]; }
  private at(type: TokenType): boolean { return this.peek().type === type; }
  private next(): Token { return this.tokens[this.pos++]; }

  private expect(type: TokenType, what: string): Token {
    const t = this.peek();
    if (t.type !== type) throw new SflParseError(`expected ${what}, got '${t.value || t.type}'`, t.line, t.col);
    return this.next();
  }

  /** Skip any run of NEWLINE tokens (whitespace around braces is free — §4.1). */
  private skipNewlines(): void { while (this.at('newline')) this.next(); }

  // ─── document = header , { block } ───────────────────────────────────────
  parseDocument(): SflDocument {
    this.skipNewlines();
    // header = "sfl" number newline
    const kw = this.expect('ident', "'sfl' header");
    if (kw.value !== 'sfl') throw new SflParseError(`document must start with 'sfl', got '${kw.value}'`, kw.line, kw.col);
    const ver = this.expect('number', 'version number');
    this.skipNewlines();

    const blocks: SflBlock[] = [];
    while (!this.at('eof')) {
      blocks.push(this.parseBlock());
      this.skipNewlines();
    }
    return { version: ver.value, blocks };
  }

  // ─── block = kind name [":" composition-list] "{" { entry } "}" ──────────
  private parseBlock(): SflBlock {
    const kindTok = this.expect('ident', 'block kind');
    if (!isBlockKind(kindTok.value)) {
      throw new SflParseError(`unknown block kind '${kindTok.value}'`, kindTok.line, kindTok.col);
    }
    const nameTok = this.expect('ident', 'block name');

    const composition: string[] = [];
    const compositionRanges: SflRange[] = [];
    if (this.at('colon')) {
      this.next();
      const first = this.expect('ident', 'reference name after ":"');
      composition.push(first.value);
      compositionRanges.push(tokenRange(first));
      while (this.at('amp')) {
        this.next();
        const ref = this.expect('ident', 'reference name after "&"');
        composition.push(ref.value);
        compositionRanges.push(tokenRange(ref));
      }
    }

    this.skipNewlines();
    this.expect('lbrace', "'{'");
    const entries: SflEntry[] = [];
    this.skipNewlines();
    while (!this.at('rbrace')) {
      if (this.at('eof')) throw new SflParseError('unterminated block (missing "}")', this.peek().line, this.peek().col);
      entries.push(this.parseEntry());
      this.skipNewlines();
    }
    const closeTok = this.expect('rbrace', "'}'");

    return {
      kind: kindTok.value,
      kindRange: tokenRange(kindTok),
      name: nameTok.value,
      nameRange: tokenRange(nameTok),
      composition,
      compositionRanges,
      range: { start: tokenRange(kindTok).start, end: tokenRange(closeTok).end },
      entries,
    };
  }

  // ─── entry = property | block | layout-block | style-block ───────────────
  private parseEntry(): SflEntry {
    const t = this.peek();
    if (t.type !== 'ident') {
      throw new SflParseError(`expected property, block, layout, or style — got '${t.value || t.type}'`, t.line, t.col);
    }

    // Nested block: block-kind followed by a name identifier.
    if (isBlockKind(t.value) && this.peek(1).type === 'ident') {
      return { type: 'block', block: this.parseBlock() };
    }

    // layout-block: `layout {` (a property `layout:` is disambiguated by the ':')
    if (t.value === 'layout' && this.peek(1).type === 'lbrace') {
      return { type: 'layout', layout: this.parseLayout() };
    }

    // style-block: `style {` (a property `style:` is disambiguated by the ':')
    if (t.value === 'style' && this.peek(1).type === 'lbrace') {
      return { type: 'style', style: this.parseStyle() };
    }

    return { type: 'property', property: this.parseProperty() };
  }

  private parseLayout(): SflLayout {
    this.next(); // 'layout'
    this.skipNewlines();
    this.expect('lbrace', "'{'");
    const properties: SflProperty[] = [];
    this.skipNewlines();
    while (!this.at('rbrace')) {
      if (this.at('eof')) throw new SflParseError('unterminated layout block', this.peek().line, this.peek().col);
      properties.push(this.parseProperty());
      this.skipNewlines();
    }
    this.expect('rbrace', "'}'");
    return { properties };
  }

  private parseStyle(): SflStyle {
    this.next(); // 'style'
    this.skipNewlines();
    this.expect('lbrace', "'{'");
    const properties: SflProperty[] = [];
    this.skipNewlines();
    while (!this.at('rbrace')) {
      if (this.at('eof')) throw new SflParseError('unterminated style block', this.peek().line, this.peek().col);
      properties.push(this.parseProperty());
      this.skipNewlines();
    }
    this.expect('rbrace', "'}'");
    return { properties };
  }

  // ─── property = identifier ":" value (newline | ";") ─────────────────────
  private parseProperty(): SflProperty {
    const keyTok = this.expect('ident', 'property key');
    const key = keyTok.value;
    this.expect('colon', "':'");
    const value = (key === 'from' || key === 'to') ? this.parseEndpoint() : this.parseValue();
    this.consumeTerminator();
    return { key, keyRange: tokenRange(keyTok), value };
  }

  /** A property terminates at newline, ";", or the closing brace / EOF (§5). */
  private consumeTerminator(): void {
    if (this.at('newline')) { this.next(); return; }
    if (this.at('semi')) { this.next(); return; }
    if (this.at('rbrace') || this.at('eof')) return;
    const t = this.peek();
    throw new SflParseError(`unexpected '${t.value || t.type}' after property value`, t.line, t.col);
  }

  // ─── endpoint = path [ "," side [ "(" fraction ")" ] ]  (from/to only, §10/§16) ──
  private parseEndpoint(): SflValue {
    const { segments, ranges } = this.parsePathSegments();
    let side: Side | undefined;
    let fraction: number | undefined;
    if (this.at('comma')) {
      this.next(); // ','
      const sideTok = this.expect('ident', 'side after ","');
      if (!isSide(sideTok.value)) {
        throw new SflParseError(`expected a side (top/right/bottom/left), got '${sideTok.value}'`, sideTok.line, sideTok.col);
      }
      side = sideTok.value as Side;
      if (this.at('lparen')) {
        this.next(); // '('
        fraction = this.expect('number', 'fraction inside "("').numberValue;
        this.expect('rparen', "')'");
      }
    }
    return { type: 'endpoint', segments, segmentRanges: ranges, side, fraction };
  }

  private parsePathSegments(): { segments: string[]; ranges: SflRange[] } {
    const first = this.expect('ident', 'path identifier');
    const segments = [first.value];
    const ranges = [tokenRange(first)];
    while (this.at('dot')) {
      this.next();
      const seg = this.expect('ident', 'identifier after "."');
      segments.push(seg.value);
      ranges.push(tokenRange(seg));
    }
    return { segments, ranges };
  }

  // ─── value = string | list | tuple | number | path | keyword ─────────────
  // `allowTuple` is only true at property level. INSIDE a list, a comma is
  // always a list separator, never a tuple — otherwise `[150, "x"]` would be
  // misread as the tuple `150, "x"`.
  private parseValue(allowTuple = true): SflValue {
    const t = this.peek();
    switch (t.type) {
      case 'string':
        this.next();
        return { type: 'string', value: t.value, multiline: !!t.multiline };
      case 'lbracket':
        return this.parseList();
      case 'number': {
        this.next();
        // tuple = number "," number { "," number }  (property level only)
        if (allowTuple && this.at('comma')) {
          const values = [t.numberValue!];
          while (this.at('comma')) {
            this.next();
            values.push(this.expect('number', 'number in tuple').numberValue!);
          }
          return { type: 'tuple', values };
        }
        return { type: 'number', value: t.numberValue! };
      }
      case 'ident': {
        const { segments, ranges } = this.parsePathSegments();
        return { type: 'ident', segments, segmentRanges: ranges };
      }
      default:
        throw new SflParseError(`expected a value, got '${t.value || t.type}'`, t.line, t.col);
    }
  }

  private parseList(): SflValue {
    this.expect('lbracket', "'['");
    const values: V[] = [];
    this.skipNewlines();
    if (!this.at('rbracket')) {
      values.push(this.parseValue(false)); // no tuple detection inside lists
      this.skipNewlines();
      while (this.at('comma')) {
        this.next();
        this.skipNewlines();
        if (this.at('rbracket')) break; // tolerate trailing comma
        values.push(this.parseValue(false));
        this.skipNewlines();
      }
    }
    this.expect('rbracket', "']'");
    return { type: 'list', values };
  }
}
