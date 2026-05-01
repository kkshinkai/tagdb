import {defaultHandlers} from "mdast-util-to-markdown";
import type {Handle, Options} from "mdast-util-to-markdown";
import type {TagdbAttachment, TagdbPropertyAttachment} from "../types.js";

type AnyNode = {
  type: string;
  value?: string;
  data?: {
    tagdb?: {
      attachments?: TagdbAttachment[];
    };
  };
};

export function tagdbToMarkdown(): Options {
  return {
    handlers: {
      heading: withAttachments(defaultHandlers.heading),
      paragraph: withAttachments(defaultHandlers.paragraph),
      tagdbTag: tag,
      tagdbProperty: property
    } as never
  };
}

const tag: Handle = function tag(node) {
  return formatTag((node as AnyNode).value || "");
};

const property: Handle = function property(node) {
  const anyNode = node as AnyNode;
  const tagdb = anyNode.data?.tagdb as
    | {
        name?: string;
        raw?: string;
        value?: unknown;
      }
    | undefined;

  return formatProperty({
    kind: "property",
    name: tagdb?.name || "",
    valueKind: "scalar",
    raw: tagdb?.raw || String(tagdb?.value ?? ""),
    value: String(tagdb?.value ?? "")
  });
};

function withAttachments(handle: Handle): Handle {
  return function tagged(node, parent, state, info) {
    let value = handle(node, parent, state, info);
    const attachments = ((node as AnyNode).data?.tagdb?.attachments || []);
    const tags = attachments
      .filter((attachment) => attachment.kind === "tag")
      .map((attachment) => formatTag(attachment.name));
    const properties = attachments
      .filter((attachment): attachment is TagdbPropertyAttachment => attachment.kind === "property")
      .map(formatProperty);

    if (tags.length > 0) value += " " + tags.join(" ");
    if (properties.length > 0) value += "\n" + properties.join("\n");
    return value;
  };
}

function formatTag(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return "#" + name;
  return '#"' + name.replace(/["\\]/g, "\\$&") + '"';
}

function formatProperty(property: TagdbPropertyAttachment): string {
  return formatName(property.name) + ":: " + formatValue(property);
}

function formatName(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return name;
  return '"' + name.replace(/["\\]/g, "\\$&") + '"';
}

function formatValue(property: TagdbPropertyAttachment): string {
  if (property.raw && parsesAsValue(property.raw, property.value)) return property.raw;
  const value = typeof property.value === "string" ? property.value : String(property.value);

  if (value === "" || needsQuotedValue(value)) {
    return '"' + value.replace(/["\\]/g, "\\$&") + '"';
  }

  return value;
}

function parsesAsValue(raw: string, value: unknown): boolean {
  if (raw.length >= 2) {
    const quote = raw.charAt(0);
    if ((quote === '"' || quote === "'") && raw.charAt(raw.length - 1) === quote) {
      return raw.slice(1, -1).replace(/\\([\s\S])/g, "$1") === value;
    }
  }

  return raw === value;
}

function needsQuotedValue(value: string): boolean {
  return (
    /^[ \t]/.test(value) ||
    /[ \t]$/.test(value) ||
    /#/.test(value) ||
    /::/.test(value) ||
    /[`*_[\]]/.test(value)
  );
}
