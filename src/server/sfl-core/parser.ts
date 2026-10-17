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
// The stickyflow.js 0.2 additions follow src/sflLanguage/parsing/ in that
// package: `fields { }`, `data { }` (series written with or without the
// `Series` keyword), bindings (`key: <- expr`) and handlers (`onTap: …`).
//
// Spec: §17 (Grammatik).

import {
  type SflDocument, type SflBlock, type SflEntry, type SflProperty,
  type SflLayout, type SflStyle, type SflValue, type SflValue as V, type SflRange,
  type SflBinding, type SflHandler, type SflAssignment, type SflExpr,
  type ExpressionOperator, isBlockKind, isSide, type Side, REMOVED_BLOCK_KINDS,
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

const OR: ReadonlySet<string> = new Set(['||']);
const AND: ReadonlySet<string> = new Set(['&&']);
const COMPARISONS: ReadonlySet<string> = new Set(['>', '<', '>=', '<=', '==', '!=']);
const ADDITIVE: ReadonlySet<string> = new Set(['+', '-']);
const MULTIPLICATIVE: ReadonlySet<string> = new Set(['*', '/']);

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
      const removed = REMOVED_BLOCK_KINDS[kindTok.value];
      throw new SflParseError(removed ?? `unknown block kind '${kindTok.value}'`, kindTok.line, kindTok.col);
    }
    const nameTok = this.expect('ident', 'block name');
    const { composition, compositionRanges } = this.parseComposition();
    const { entries, closeTok } = this.parseEntries(() => this.parseEntry());

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

  private parseComposition(): { composition: string[]; compositionRanges: SflRange[] } {
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
    return { composition, compositionRanges };
  }

  /** `"{" { entry [";"] } "}"`, each entry read by `parseOne`. */
  private parseEntries(parseOne: () => SflEntry): { entries: SflEntry[]; closeTok: Token } {
    this.skipNewlines();
    this.expect('lbrace', "'{'");
    const entries: SflEntry[] = [];
    this.skipNewlines();
    while (!this.at('rbrace')) {
      if (this.at('eof')) throw new SflParseError('unterminated block (missing "}")', this.peek().line, this.peek().col);
      entries.push(parseOne());
      if (this.at('semi')) this.next();
      this.skipNewlines();
    }
    const closeTok = this.expect('rbrace', "'}'");
    return { entries, closeTok };
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

    // fields-block: a DataSource's typed fields
    if (t.value === 'fields' && this.peek(1).type === 'lbrace') {
      return { type: 'fields', fields: this.parsePropertyBlock('fields') };
    }

    // binding: `key: <- expr` (also `<->` and `->`)
    if (this.atBinding()) {
      return { type: 'binding', binding: this.parseBinding() };
    }

    // handler: `onTap: target <- expr` or `onTap { … }`
    if (this.atHandler()) {
      return { type: 'handler', handler: this.parseHandler() };
    }

    // data-block: a Chart's series or a DataSource's rows
    if (t.value === 'data' && this.peek(1).type === 'lbrace') {
      this.next(); // 'data'
      return { type: 'data', data: { entries: this.parseEntries(() => this.parseDataEntry()).entries } };
    }

    return { type: 'property', property: this.parseProperty() };
  }

  /** Inside `data { }` a series may drop the `Series` keyword: `revenue { … }` or `revenue : base { … }`. */
  private parseDataEntry(): SflEntry {
    const t = this.peek();
    if (t.type === 'ident' && !isBlockKind(t.value) && this.looksLikeSeriesEntry()) {
      const nameTok = this.next();
      const { composition, compositionRanges } = this.parseComposition();
      const { entries, closeTok } = this.parseEntries(() => this.parseEntry());
      return {
        type: 'block',
        block: {
          kind: 'Series',
          name: nameTok.value,
          nameRange: tokenRange(nameTok),
          composition,
          compositionRanges,
          range: { start: tokenRange(nameTok).start, end: tokenRange(closeTok).end },
          entries,
        },
      };
    }
    return this.parseEntry();
  }

  private looksLikeSeriesEntry(): boolean {
    if (this.peek(1).type === 'lbrace') return true;
    if (this.peek(1).type !== 'colon') return false;
    let o = 2;
    if (this.peek(o).type !== 'ident') return false;
    o++;
    while (this.peek(o).type === 'amp') {
      o++;
      if (this.peek(o).type !== 'ident') return false;
      o++;
    }
    return this.peek(o).type === 'lbrace';
  }

  private parseLayout(): SflLayout {
    return { properties: this.parsePropertyBlock('layout') };
  }

  /** `layout { … }` / `fields { … }`: the keyword, then properties only. */
  private parsePropertyBlock(what: 'layout' | 'fields'): SflProperty[] {
    this.next(); // the keyword
    this.skipNewlines();
    this.expect('lbrace', "'{'");
    const properties: SflProperty[] = [];
    this.skipNewlines();
    while (!this.at('rbrace')) {
      if (this.at('eof')) throw new SflParseError(`unterminated ${what} block`, this.peek().line, this.peek().col);
      properties.push(this.parseProperty());
      this.skipNewlines();
    }
    this.expect('rbrace', "'}'");
    return properties;
  }

  private parseStyle(): SflStyle {
    this.next(); // 'style'
    this.skipNewlines();
    this.expect('lbrace', "'{'");
    const properties: SflProperty[] = [];
    const bindings: SflBinding[] = [];
    this.skipNewlines();
    while (!this.at('rbrace')) {
      if (this.at('eof')) throw new SflParseError('unterminated style block', this.peek().line, this.peek().col);
      if (this.atBinding()) {
        bindings.push(this.parseBinding());
        if (this.at('newline') || this.at('semi')) this.next();
      } else {
        properties.push(this.parseProperty());
      }
      this.skipNewlines();
    }
    this.expect('rbrace', "'}'");
    return bindings.length ? { properties, bindings } : { properties };
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

  // ─── bindings and handlers ───────────────────────────────────────────────
  private atBinding(): boolean {
    const op = this.peek(2).type;
    return this.at('ident') && this.peek(1).type === 'colon' && (op === 'bind' || op === 'bind2' || op === 'action');
  }

  private atHandler(): boolean {
    const next = this.peek(1).type;
    return this.at('ident') && /^on[A-Z]/.test(this.peek().value) && (next === 'colon' || next === 'lbrace');
  }

  private parseBinding(): SflBinding {
    const keyTok = this.expect('ident', 'bound property');
    this.expect('colon', "':'");
    const operator = this.next().value as SflBinding['operator'];
    const expr = this.parseExpression();
    this.expectEnd('binding');
    return { key: keyTok.value, keyRange: tokenRange(keyTok), operator, expr };
  }

  private parseHandler(): SflHandler {
    const eventTok = this.expect('ident', 'event name');
    const assignments: SflAssignment[] = [];
    if (this.at('colon')) {
      this.next();
      assignments.push(this.parseAssignment());
      this.expectEnd('handler');
    } else {
      this.expect('lbrace', "'{'");
      this.skipNewlines();
      while (!this.at('rbrace')) {
        if (this.at('eof')) throw new SflParseError(`unterminated handler '${eventTok.value}'`, eventTok.line, eventTok.col);
        assignments.push(this.parseAssignment());
        this.expectEnd('assignment');
        if (this.at('semi')) this.next();
        this.skipNewlines();
      }
      this.expect('rbrace', "'}'");
    }
    return { event: eventTok.value, eventRange: tokenRange(eventTok), assignments };
  }

  private parseAssignment(): SflAssignment {
    const { segments, ranges } = this.parsePathSegments();
    this.expect('bind', "'<-'");
    return { target: segments, targetRanges: ranges, expr: this.parseExpression() };
  }

  /** Bindings, handlers and assignments end at newline, ";", "}" or EOF; the caller consumes it. */
  private expectEnd(what: string): void {
    const t = this.peek();
    if (t.type === 'newline' || t.type === 'semi' || t.type === 'rbrace' || t.type === 'eof') return;
    throw new SflParseError(`unexpected '${t.value || t.type}' after ${what}`, t.line, t.col);
  }

  // ─── expressions, loosest first: || && comparison + * unary primary ──────
  private parseExpression(): SflExpr {
    return this.parseBinaryLevel(OR, () =>
      this.parseBinaryLevel(AND, () =>
        this.parseBinaryLevel(COMPARISONS, () =>
          this.parseBinaryLevel(ADDITIVE, () =>
            this.parseBinaryLevel(MULTIPLICATIVE, () => this.parseUnary())))));
  }

  private parseBinaryLevel(operators: ReadonlySet<string>, parseOperand: () => SflExpr): SflExpr {
    let left = parseOperand();
    while (this.at('op') && operators.has(this.peek().value)) {
      const operator = this.next().value as ExpressionOperator;
      left = { kind: 'binary', operator, left, right: parseOperand() };
    }
    return left;
  }

  private parseUnary(): SflExpr {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '!' || t.value === '-')) {
      this.next();
      return { kind: 'unary', operator: t.value, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): SflExpr {
    const t = this.peek();
    switch (t.type) {
      case 'number':
        this.next();
        return { kind: 'number', value: t.numberValue! };
      case 'string':
        this.next();
        return { kind: 'string', value: t.value };
      case 'lparen': {
        this.next();
        const inner = this.parseExpression();
        this.expect('rparen', "')'");
        return inner;
      }
      case 'ident': {
        const { segments, ranges } = this.parsePathSegments();
        if (segments.length === 1 && (segments[0] === 'true' || segments[0] === 'false')) {
          return { kind: 'boolean', value: segments[0] === 'true' };
        }
        return this.at('lparen')
          ? { kind: 'call', callee: segments, args: this.parseCallArguments() }
          : { kind: 'ref', path: segments, pathRanges: ranges };
      }
      default:
        throw new SflParseError(`expected an expression, got '${t.value || t.type}'`, t.line, t.col);
    }
  }

  private parseCallArguments(): SflExpr[] {
    this.expect('lparen', "'('");
    const args: SflExpr[] = [];
    this.skipNewlines();
    while (!this.at('rparen')) {
      args.push(this.parseExpression());
      this.skipNewlines();
      if (this.at('comma')) {
        this.next();
        this.skipNewlines();
      } else if (!this.at('rparen')) {
        const t = this.peek();
        throw new SflParseError(`expected ',' or ')', got '${t.value || t.type}'`, t.line, t.col);
      }
    }
    this.expect('rparen', "')'");
    return args;
  }
}
