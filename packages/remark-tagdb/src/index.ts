import type {Root} from "mdast";
import type {Processor} from "unified";
import {tagdbFromMarkdown} from "./mdast/from-markdown.js";
import {tagdbToMarkdown} from "./mdast/to-markdown.js";
import {tagdbSyntax} from "./micromark/syntax.js";
import type {RemarkTagdbOptions} from "./types.js";

export type {RemarkTagdbOptions, TagdbData, TagdbTagNode} from "./types.js";

export default function remarkTagdb(
  this: Processor<Root>,
  options: RemarkTagdbOptions = {}
) {
  const data = selfData(this);

  const micromarkExtensions =
    data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  micromarkExtensions.push(tagdbSyntax(options));
  fromMarkdownExtensions.push(tagdbFromMarkdown());
  toMarkdownExtensions.push(tagdbToMarkdown());
}

function selfData(processor: Processor<Root>) {
  return processor.data() as {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
    toMarkdownExtensions?: unknown[];
  };
}
