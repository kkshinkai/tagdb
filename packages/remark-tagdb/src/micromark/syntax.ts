import type {
  Code,
  Construct,
  Effects,
  Extension,
  Previous,
  State,
  TokenizeContext,
  Tokenizer
} from "micromark-util-types";
import type {RemarkTagdbOptions} from "../types.js";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    tagdbTag: "tagdbTag";
    tagdbTagMarker: "tagdbTagMarker";
    tagdbTagName: "tagdbTagName";
    tagdbTagNameMarker: "tagdbTagNameMarker";
    tagdbProperty: "tagdbProperty";
    tagdbPropertyFlow: "tagdbPropertyFlow";
    tagdbPropertyName: "tagdbPropertyName";
    tagdbPropertyNameMarker: "tagdbPropertyNameMarker";
    tagdbPropertyMarker: "tagdbPropertyMarker";
    tagdbPropertyValue: "tagdbPropertyValue";
    tagdbPropertyValueMarker: "tagdbPropertyValueMarker";
  }
}

const codes = {
  eof: null,
  horizontalTab: -2,
  virtualSpace: -1,
  space: 32,
  quotationMark: 34,
  numberSign: 35,
  apostrophe: 39,
  leftParenthesis: 40,
  asterisk: 42,
  backslash: 92,
  colon: 58,
  hyphenMinus: 45,
  underscore: 95,
  leftSquareBracket: 91,
  leftCurlyBrace: 123
} as const;

export function tagdbSyntax(options: RemarkTagdbOptions = {}): Extension {
  const tags = normalizeNames(options.tags);
  const properties = normalizeNames(options.properties);
  const tagdbTagText: Construct = {
    name: "tagdbTagText",
    tokenize: tokenizeTag(tags),
    previous
  };
  const tagdbPropertyText: Construct = {
    name: "tagdbPropertyText",
    tokenize: tokenizeProperty(properties, "tagdbProperty"),
    previous
  };
  const tagdbPropertyFlow: Construct = {
    name: "tagdbPropertyFlow",
    tokenize: tokenizeProperty(properties, "tagdbPropertyFlow")
  };

  const propertyFlow = propertyFlowConstructs(tagdbPropertyFlow);
  const propertyText = propertyTextConstructs(tagdbPropertyText);

  return {
    flow: propertyFlow,
    text: {
      [codes.numberSign]: tagdbTagText,
      ...propertyText
    }
  };
}

function normalizeNames(names: ReadonlyArray<string> | ReadonlySet<string> | undefined): ReadonlySet<string> {
  if (!names) return new Set();
  return names instanceof Set ? names : new Set(names);
}

function propertyFlowConstructs(construct: Construct): Extension["flow"] {
  const flow: NonNullable<Extension["flow"]> = {};
  const starts = [
    codes.quotationMark,
    codes.apostrophe,
    ...range(65, 90),
    ...range(97, 122)
  ];

  for (const code of starts) {
    flow[code] = construct;
  }

  return flow;
}

function propertyTextConstructs(construct: Construct): NonNullable<Extension["text"]> {
  const text: NonNullable<Extension["text"]> = {};
  const starts = [
    codes.quotationMark,
    codes.apostrophe,
    ...range(65, 90),
    ...range(97, 122)
  ];

  for (const code of starts) {
    text[code] = construct;
  }

  return text;
}

function range(start: number, end: number): number[] {
  const values: number[] = [];
  for (let code = start; code <= end; code++) values.push(code);
  return values;
}

const previous: Previous = function previous(code) {
  return (
    code === codes.eof ||
    markdownLineEndingOrSpace(code) ||
    code === codes.leftParenthesis ||
    code === codes.leftSquareBracket ||
    code === codes.leftCurlyBrace
  );
};

function tokenizeTag(tags: ReadonlySet<string>): Tokenizer {
  return function tokenizeTag(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State
  ): State {
    let name = "";
    let quote: Code | undefined;

    return start;

    function start(code: Code): State | undefined {
      if (code !== codes.numberSign) return nok(code);

      effects.enter("tagdbTag");
      effects.enter("tagdbTagMarker");
      effects.consume(code);
      effects.exit("tagdbTagMarker");
      return afterMarker;
    }

    function afterMarker(code: Code): State | undefined {
      if (code === codes.quotationMark || code === codes.apostrophe) {
        quote = code;
        effects.enter("tagdbTagNameMarker");
        effects.consume(code);
        effects.exit("tagdbTagNameMarker");
        return quotedNameStart;
      }

      if (!asciiAlpha(code)) return nok(code);

      effects.enter("tagdbTagName");
      name += String.fromCharCode(code as number);
      effects.consume(code);
      return unquotedName;
    }

    function unquotedName(code: Code): State | undefined {
      if (isNameCode(code)) {
        name += String.fromCharCode(code as number);
        effects.consume(code);
        return unquotedName;
      }

      effects.exit("tagdbTagName");

      if (!tags.has(name)) return nok(code);

      effects.exit("tagdbTag");
      return ok(code);
    }

    function quotedNameStart(code: Code): State | undefined {
      if (code === quote || code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      effects.enter("tagdbTagName");
      return quotedName(code);
    }

    function quotedName(code: Code): State | undefined {
      if (code === quote) {
        effects.exit("tagdbTagName");

        if (!tags.has(name)) return nok(code);

        effects.enter("tagdbTagNameMarker");
        effects.consume(code);
        effects.exit("tagdbTagNameMarker");
        effects.exit("tagdbTag");
        return ok;
      }

      if (code === codes.backslash) {
        effects.consume(code);
        return quotedEscape(quotedName);
      }

      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      name += String.fromCharCode(code as number);
      effects.consume(code);
      return quotedName;
    }

    function quotedEscape(returnState: State): State {
      return function escape(code: Code): State | undefined {
        if (code === codes.eof || markdownLineEnding(code)) {
          return nok(code);
        }

        name += String.fromCharCode(code as number);
        effects.consume(code);
        return returnState;
      };
    }
  };
}

function tokenizeProperty(properties: ReadonlySet<string>, tokenType: "tagdbProperty" | "tagdbPropertyFlow"): Tokenizer {
  return function tokenizeProperty(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State
  ): State {
    let name = "";
    let nameQuote: Code | undefined;
    let valueQuote: Code | undefined;

    return start;

    function start(code: Code): State | undefined {
      if (!properties.size) return nok(code);

      effects.enter(tokenType);
      return nameStart(code);
    }

    function nameStart(code: Code): State | undefined {
      if (code === codes.quotationMark || code === codes.apostrophe) {
        nameQuote = code;
        effects.enter("tagdbPropertyNameMarker");
        effects.consume(code);
        effects.exit("tagdbPropertyNameMarker");
        return quotedNameStart;
      }

      if (!asciiAlpha(code)) return nok(code);

      effects.enter("tagdbPropertyName");
      name += String.fromCharCode(code as number);
      effects.consume(code);
      return unquotedName;
    }

    function unquotedName(code: Code): State | undefined {
      if (isNameCode(code)) {
        name += String.fromCharCode(code as number);
        effects.consume(code);
        return unquotedName;
      }

      effects.exit("tagdbPropertyName");
      if (!properties.has(name)) return nok(code);
      return markerStart(code);
    }

    function quotedNameStart(code: Code): State | undefined {
      if (code === nameQuote || code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      effects.enter("tagdbPropertyName");
      return quotedName(code);
    }

    function quotedName(code: Code): State | undefined {
      if (code === nameQuote) {
        effects.exit("tagdbPropertyName");
        if (!properties.has(name)) return nok(code);

        effects.enter("tagdbPropertyNameMarker");
        effects.consume(code);
        effects.exit("tagdbPropertyNameMarker");
        return markerStart;
      }

      if (code === codes.backslash) {
        effects.consume(code);
        return quotedNameEscape;
      }

      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      name += String.fromCharCode(code as number);
      effects.consume(code);
      return quotedName;
    }

    function quotedNameEscape(code: Code): State | undefined {
      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      name += String.fromCharCode(code as number);
      effects.consume(code);
      return quotedName;
    }

    function markerStart(code: Code): State | undefined {
      if (code !== codes.colon) return nok(code);

      effects.enter("tagdbPropertyMarker");
      effects.consume(code);
      return markerEnd;
    }

    function markerEnd(code: Code): State | undefined {
      if (code !== codes.colon) return nok(code);

      effects.consume(code);
      effects.exit("tagdbPropertyMarker");
      return beforeValue;
    }

    function beforeValue(code: Code): State | undefined {
      if (code === codes.space || code === codes.horizontalTab || code === codes.virtualSpace) {
        effects.consume(code);
        return beforeValue;
      }

      if (code === codes.quotationMark || code === codes.apostrophe) {
        valueQuote = code;
        effects.enter("tagdbPropertyValue");
        effects.enter("tagdbPropertyValueMarker");
        effects.consume(code);
        effects.exit("tagdbPropertyValueMarker");
        return quotedValue;
      }

      if (code === codes.eof || markdownLineEnding(code)) {
        effects.enter("tagdbPropertyValue");
        effects.exit("tagdbPropertyValue");
        effects.exit(tokenType);
        return ok(code);
      }

      effects.enter("tagdbPropertyValue");
      effects.consume(code);
      return unquotedValue;
    }

    function unquotedValue(code: Code): State | undefined {
      if (code === codes.eof || markdownLineEnding(code)) {
        effects.exit("tagdbPropertyValue");
        effects.exit(tokenType);
        return ok(code);
      }

      effects.consume(code);
      return unquotedValue;
    }

    function quotedValue(code: Code): State | undefined {
      if (code === valueQuote) {
        effects.enter("tagdbPropertyValueMarker");
        effects.consume(code);
        effects.exit("tagdbPropertyValueMarker");
        effects.exit("tagdbPropertyValue");
        effects.exit(tokenType);
        return ok;
      }

      if (code === codes.backslash) {
        effects.consume(code);
        return quotedValueEscape;
      }

      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      effects.consume(code);
      return quotedValue;
    }

    function quotedValueEscape(code: Code): State | undefined {
      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      effects.consume(code);
      return quotedValue;
    }
  };
}

function asciiAlpha(code: Code): boolean {
  return (
    code !== null &&
    ((code >= 65 && code <= 90) || (code >= 97 && code <= 122))
  );
}

function asciiAlphanumeric(code: Code): boolean {
  return asciiAlpha(code) || (code !== null && code >= 48 && code <= 57);
}

function isNameCode(code: Code): boolean {
  return asciiAlphanumeric(code) || code === codes.hyphenMinus || code === codes.underscore;
}

function markdownLineEnding(code: Code): boolean {
  return code !== null && code < codes.horizontalTab;
}

function markdownLineEndingOrSpace(code: Code): boolean {
  return (
    code !== null &&
    (code < 0 || code === codes.space)
  );
}
