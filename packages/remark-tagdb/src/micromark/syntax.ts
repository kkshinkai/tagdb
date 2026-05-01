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
  backslash: 92,
  hyphenMinus: 45,
  underscore: 95,
  leftSquareBracket: 91,
  leftCurlyBrace: 123
} as const;

export function tagdbSyntax(options: RemarkTagdbOptions = {}): Extension {
  const tags = normalizeTags(options.tags);
  const tag: Construct = {
    name: "tagdbTag",
    tokenize: tokenizeTag(tags),
    previous
  };

  return {
    text: {
      [codes.numberSign]: tag
    }
  };
}

function normalizeTags(tags: RemarkTagdbOptions["tags"]): ReadonlySet<string> {
  if (!tags) return new Set();
  return tags instanceof Set ? tags : new Set(tags);
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
      if (asciiAlphanumeric(code) || code === codes.hyphenMinus || code === codes.underscore) {
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
        return quotedEscape;
      }

      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      name += String.fromCharCode(code as number);
      effects.consume(code);
      return quotedName;
    }

    function quotedEscape(code: Code): State | undefined {
      if (code === codes.eof || markdownLineEnding(code)) {
        return nok(code);
      }

      name += String.fromCharCode(code as number);
      effects.consume(code);
      return quotedName;
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

function markdownLineEnding(code: Code): boolean {
  return code !== null && code < codes.horizontalTab;
}

function markdownLineEndingOrSpace(code: Code): boolean {
  return (
    code !== null &&
    (code < 0 || code === codes.space)
  );
}
