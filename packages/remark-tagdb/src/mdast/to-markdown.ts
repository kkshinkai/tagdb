import {defaultHandlers, toMarkdown} from "mdast-util-to-markdown";
import type {Handle, Options} from "mdast-util-to-markdown";
import type {Root} from "mdast";
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
      root,
      heading: withAttachments(defaultHandlers.heading),
      paragraph: withAttachments(defaultHandlers.paragraph),
      tagdbTag: tag,
      tagdbProperty: property
    } as never
  };
}

const root: Handle = function root(node, parent, state, info) {
  const value = defaultHandlers.root(node, parent, state, info);
  const attachments = ((node as AnyNode).data?.tagdb?.attachments || []).map(formatAttachment);
  if (attachments.length === 0) return value;
  return attachments.join("\n") + (value ? "\n\n" + value : "");
};

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
    const inlineAttachments = attachments
      .filter((attachment) => attachment.placement === "inline")
      .map(formatAttachment);
    const formatted = attachments
      .filter((attachment) => attachment.placement !== "inline")
      .map((attachment) => indent(formatAttachment(attachment), "  "));

    if (inlineAttachments.length > 0) value += " " + inlineAttachments.join(" ");
    if (formatted.length > 0) {
      value += "\n" + formatted.join("\n");
    }

    return value;
  };
}

function formatAttachment(attachment: TagdbAttachment): string {
  return attachment.kind === "tag" ? formatTag(attachment.name) : formatProperty(attachment);
}

function formatTag(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return "#" + name;
  return '#"' + name.replace(/["\\]/g, "\\$&") + '"';
}

function formatProperty(property: TagdbPropertyAttachment): string {
  if (property.valueKind === "object") {
    const entries = property.value && typeof property.value === "object" && !Array.isArray(property.value)
      ? Object.entries(property.value)
      : [];
    return formatName(property.name) + "::" + (entries.length > 0 ? "\n" + indent(entries.map(([key, value]) => formatNestedEntry(key, value)).join("\n"), "  ") : "");
  }

  if (property.valueKind === "array") {
    const entries = Array.isArray(property.value) ? property.value : [];
    return formatName(property.name) + "::" + (entries.length > 0 ? "\n" + indent(entries.map((value) => formatNestedEntry("", value)).join("\n"), "  ") : "");
  }

  if (property.valueKind === "markdown") {
    const markdown = property.children
      ? toMarkdown({type: "root", children: property.children} as Root, tagdbToMarkdown()).replace(/\n$/, "")
      : String(property.value || "");
    return formatName(property.name) + "::" + (markdown ? "\n" + indent(markdown, "  ") : "");
  }

  return formatName(property.name) + ":: " + formatValue(property);
}

function formatNestedEntry(name: string, value: unknown): string {
  if (Array.isArray(value)) {
    return formatName(name) + "::\n" + indent(value.map((item) => formatNestedEntry("", item)).join("\n"), "  ");
  }

  if (value && typeof value === "object") {
    return formatName(name) + "::\n" + indent(Object.entries(value).map(([key, item]) => formatNestedEntry(key, item)).join("\n"), "  ");
  }

  const prefix = name ? formatName(name) : "";
  return prefix + ":: " + formatScalar(String(value ?? ""));
}

function formatName(name: string): string {
  if (name === "") return "";
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return name;
  return '"' + name.replace(/["\\]/g, "\\$&") + '"';
}

function formatValue(property: TagdbPropertyAttachment): string {
  if (property.raw && parsesAsValue(property.raw, property.value)) return property.raw;
  const value = typeof property.value === "string" ? property.value : String(property.value);
  return formatScalar(value);
}

function formatScalar(value: string): string {
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

function indent(value: string, prefix: string): string {
  return value.split("\n").map((line) => (line ? prefix + line : line)).join("\n");
}
