import {defaultHandlers} from "mdast-util-to-markdown";
import type {Handle, Options} from "mdast-util-to-markdown";

type AnyNode = {
  type: string;
  value?: string;
  data?: {
    tagdb?: {
      tags?: string[];
    };
  };
};

export function tagdbToMarkdown(): Options {
  return {
    handlers: {
      heading: withTags(defaultHandlers.heading),
      paragraph: withTags(defaultHandlers.paragraph),
      tagdbTag: tag
    } as never
  };
}

const tag: Handle = function tag(node) {
  return formatTag((node as AnyNode).value || "");
};

function withTags(handle: Handle): Handle {
  return function tagged(node, parent, state, info) {
    const value = handle(node, parent, state, info);
    const tags = ((node as AnyNode).data?.tagdb?.tags || []).map(formatTag);
    return tags.length > 0 ? value + " " + tags.join(" ") : value;
  };
}

function formatTag(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return "#" + name;
  return '#"' + name.replace(/["\\]/g, "\\$&") + '"';
}
