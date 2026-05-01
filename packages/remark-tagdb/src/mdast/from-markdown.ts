import type {Content, Root} from "mdast";
import {toMarkdown} from "mdast-util-to-markdown";
import type {
  CompileContext,
  Extension,
  Handle,
  Transform
} from "mdast-util-from-markdown";
import type {Token} from "micromark-util-types";
import type {Point, Position} from "unist";
import type {
  TagdbAttachmentPlacement,
  JsonValue,
  RemarkTagdbOptions,
  TagdbAttachment,
  TagdbPropertyAttachment,
  TagdbPropertyNode,
  TagdbPropertyValueKind,
  TagdbSourceRange,
  TagdbTagAttachment,
  TagdbTagNode
} from "../types.js";

type AnyNode = {
  type: string;
  value?: string;
  children?: AnyNode[];
  data?: Record<string, unknown>;
  position?: Position;
};

type PropertyDefinitionMap = Map<string, {valueKind: TagdbPropertyValueKind}>;

export function tagdbFromMarkdown(options: RemarkTagdbOptions = {}): Extension {
  const properties = normalizePropertyDefinitions(options.properties);

  return {
    enter: {
      tagdbTag: enterTag,
      tagdbProperty: enterProperty,
      tagdbPropertyFlow: enterProperty
    },
    exit: {
      tagdbTagName: exitTagName,
      tagdbTag: exitTag,
      tagdbPropertyName: exitPropertyName,
      tagdbPropertyValue: exitPropertyValue,
      tagdbProperty: exitProperty,
      tagdbPropertyFlow: exitProperty
    },
    transforms: [((tree: Root) => attachTagdb(tree, properties)) as Transform]
  };
}

const enterTag: Handle = function enterTag(this: CompileContext, token: Token) {
  this.enter({
    type: "tagdbTag",
    value: "",
    data: {tagdb: {origin: rangeFromToken(token)}}
  } as never, token);
};

const exitTagName: Handle = function exitTagName(
  this: CompileContext,
  token: Token
) {
  const node = this.stack[this.stack.length - 1] as unknown as TagdbTagNode;
  node.value = decodeEscapes(this.sliceSerialize(token));
};

const exitTag: Handle = function exitTag(this: CompileContext, token: Token) {
  this.exit(token);
};

const enterProperty: Handle = function enterProperty(this: CompileContext, token: Token) {
  this.enter({
    type: "tagdbProperty",
    value: "",
    data: {
      tagdb: {
        origin: rangeFromToken(token),
        valueKind: "scalar"
      }
    }
  } as never, token);
};

const exitPropertyName: Handle = function exitPropertyName(
  this: CompileContext,
  token: Token
) {
  const node = this.stack[this.stack.length - 1] as unknown as TagdbPropertyNode;
  const data = node.data || (node.data = {});
  const tagdb = data.tagdb || (data.tagdb = {});
  tagdb.name = decodeEscapes(this.sliceSerialize(token));
};

const exitPropertyValue: Handle = function exitPropertyValue(
  this: CompileContext,
  token: Token
) {
  const node = this.stack[this.stack.length - 1] as unknown as TagdbPropertyNode;
  const raw = safeSliceSerialize(this, token).trim();
  const data = node.data || (node.data = {});
  const tagdb = data.tagdb || (data.tagdb = {});
  tagdb.raw = raw;
  tagdb.valueKind = "scalar";
  tagdb.value = parseScalarValue(raw);
  node.value = String(tagdb.value ?? "");
};

const exitProperty: Handle = function exitProperty(this: CompileContext, token: Token) {
  this.exit(token);
};

function attachTagdb(tree: Root, properties: PropertyDefinitionMap): Root {
  processChildren(tree as AnyNode, tree as AnyNode, properties, false);
  return tree;
}

function processChildren(
  parent: AnyNode,
  root: AnyNode,
  properties: PropertyDefinitionMap,
  localBackward: boolean
): void {
  if (!parent.children) return;

  let index = 0;

  while (index < parent.children.length) {
    const child = parent.children[index];

    if (isPhrasingBlock(child)) {
      const result = extractInlineAttachments(child);
      child.children = result.children;

      if (result.attachments.length > 0) {
        if (result.detached) {
          const target = localBackward ? previousLocalTarget(parent.children, index) : undefined;
          appendAttachments(target || root, withPlacement(result.attachments, target ? "block" : "root"));
          parent.children.splice(index, 1);
          continue;
        }

        appendAttachments(child, withPlacement(result.attachments, "inline"));
      }

      const scoped = collectIndentedBody(parent.children, index);

      if (scoped.children.length > 0) {
          const attachments = attachmentsFromBody(scoped.children, properties);
          if (attachments.length > 0) appendAttachments(child, withPlacement(attachments, "block"));
        parent.children.splice(index + 1, scoped.count);
      }
    } else if (child.type === "tagdbProperty") {
      const body = collectIndentedBody(parent.children, index);
      const attachment = propertyAttachment(child, body.children, properties);
      const target = body.children.length === 0
        ? previousIndentedTarget(parent.children, index, child) || (localBackward ? previousLocalTarget(parent.children, index) : undefined)
        : undefined;

      if (target) {
        appendAttachments(target, withPlacement([attachment], "block"));
      } else {
        appendAttachments(root, withPlacement([attachment], "root"));
      }

      parent.children.splice(index, 1 + body.count);
      continue;
    } else if (isEligibleBlock(child)) {
      const scoped = collectIndentedBody(parent.children, index);

      if (scoped.children.length > 0) {
        const attachments = attachmentsFromBody(scoped.children, properties);
        if (attachments.length > 0) appendAttachments(child, attachments);
        parent.children.splice(index + 1, scoped.count);
      }

      processChildren(child, root, properties, localBackward);
    } else {
      processChildren(child, root, properties, localBackward);
    }

    index++;
  }
}

function collectIndentedBody(children: AnyNode[], index: number): {children: AnyNode[]; count: number} {
  const head = children[index];
  const headColumn = head.position?.start.column || 1;
  const body: AnyNode[] = [];
  let offset = index + 1;

  while (offset < children.length) {
    const candidate = children[offset];
    const column = candidate.position?.start.column || 1;
    const codeContinuation =
      candidate.type === "code" &&
      (propertyHasEmptyValue(head) || propertyHasEmptyValue(body[body.length - 1]));
    if (column <= headColumn && !codeContinuation) break;
    body.push(candidate);
    offset++;
  }

  return {children: body, count: body.length};
}

function propertyHasEmptyValue(node: AnyNode | undefined): boolean {
  if (!node || node.type !== "tagdbProperty") return false;
  const tagdb = (node.data?.tagdb || {}) as {raw?: string};
  return !tagdb.raw;
}

function attachmentsFromBody(nodes: AnyNode[], properties: PropertyDefinitionMap): TagdbAttachment[] {
  const attachments: TagdbAttachment[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (node.type === "tagdbProperty") {
      const body = collectIndentedBody(nodes, index);
      attachments.push(propertyAttachment(node, body.children, properties));
      index += 1 + body.count;
      continue;
    }

    if (isDetachedAttachmentParagraph(node)) {
      attachments.push(...extractInlineAttachments(node).attachments);
    }

    index++;
  }

  return attachments;
}

function previousIndentedTarget(children: AnyNode[], index: number, attachmentNode: AnyNode): AnyNode | undefined {
  const column = attachmentNode.position?.start.column || 1;
  if (column <= 1) return undefined;

  let offset = index;
  while (offset > 0) {
    const candidate = children[--offset];
    if (isEligibleBlock(candidate) && (candidate.position?.start.column || 1) <= column) return candidate;
    const nested = firstEligibleDescendant(candidate);
    if (nested && (nested.position?.start.column || 1) <= column) return nested;
    if ((candidate.position?.start.column || 1) < column) return undefined;
  }

  return undefined;
}

function firstEligibleDescendant(node: AnyNode): AnyNode | undefined {
  if (!node.children) return undefined;
  for (const child of node.children) {
    if (isEligibleBlock(child)) return child;
    const nested = firstEligibleDescendant(child);
    if (nested) return nested;
  }

  return undefined;
}

function previousLocalTarget(children: AnyNode[], index: number): AnyNode | undefined {
  let offset = index;
  while (offset > 0) {
    const candidate = children[--offset];
    if (isEligibleBlock(candidate)) return candidate;
  }

  return undefined;
}

function isPhrasingBlock(node: AnyNode): boolean {
  return node.type === "paragraph" || node.type === "heading";
}

function isEligibleBlock(node: AnyNode): boolean {
  return node.type === "paragraph" || node.type === "heading";
}

function extractInlineAttachments(node: AnyNode): {
  children: AnyNode[];
  detached: boolean;
  attachments: TagdbAttachment[];
} {
  const children = node.children || [];
  const attachments: TagdbAttachment[] = [];
  const nextChildren: AnyNode[] = [];
  let hasNonAttachmentContent = false;
  let removedAttachment = false;

  for (const child of children) {
    if (child.type === "tagdbTag") {
      attachments.push(tagAttachment(child));
      removedAttachment = true;
      trimTrailingSpace(nextChildren);
      continue;
    }

    if (child.type === "tagdbProperty") {
      attachments.push(propertyAttachment(child, [], new Map()));
      removedAttachment = true;
      trimTrailingSpace(nextChildren);
      continue;
    }

    if (isWhitespaceText(child)) {
      if (removedAttachment) continue;
      nextChildren.push(child);
      continue;
    }

    hasNonAttachmentContent = hasNonAttachmentContent || !isLineEndingOnlyText(child);

    if (removedAttachment && child.type === "text" && typeof child.value === "string") {
      child.value = child.value.replace(/^[ \t]+/, "");

      const previous = nextChildren[nextChildren.length - 1];
      if (
        previous &&
        previous.type === "text" &&
        typeof previous.value === "string" &&
        previous.value.length > 0 &&
        child.value.length > 0 &&
        !/[ \t\n]$/.test(previous.value) &&
        !/^[.,;:!?)]/.test(child.value)
      ) {
        child.value = " " + child.value;
      }
    }

    nextChildren.push(child);
    removedAttachment = false;
  }

  return {
    children: mergeTextNodes(nextChildren.filter((child) => !isEmptyText(child))),
    detached: node.type === "paragraph" && !hasNonAttachmentContent,
    attachments
  };
}

function propertyAttachment(
  node: AnyNode,
  body: AnyNode[],
  properties: PropertyDefinitionMap
): TagdbPropertyAttachment {
  const tagdb = (node.data?.tagdb || {}) as {
    name?: string;
    origin?: TagdbSourceRange;
    raw?: string;
    value?: JsonValue;
    valueKind?: TagdbPropertyValueKind;
  };
  const name = tagdb.name || "";
  const definedKind = properties.get(name)?.valueKind;

  if (body.length > 0) {
    return propertyBodyAttachment(node, name, body, definedKind || inferBodyKind(body), properties);
  }

  return {
    kind: "property",
    name,
    valueKind: "scalar",
    raw: tagdb.raw || "",
    value: tagdb.value ?? "",
    origin: tagdb.origin
  };
}

function propertyBodyAttachment(
  node: AnyNode,
  name: string,
  body: AnyNode[],
  valueKind: TagdbPropertyValueKind,
  properties: PropertyDefinitionMap
): TagdbPropertyAttachment {
  if (valueKind === "markdown") {
    const children = cloneContent(body);
    const root: AnyNode = {type: "root", children: children as AnyNode[]};
    processChildren(root, root, properties, true);
    const value = markdownValue(children);

    return {
      kind: "property",
      name,
      valueKind: "markdown",
      raw: value,
      value,
      children,
      origin: tagdbOrigin(node)
    };
  }

  const entries = bodyEntries(body, properties);
  const hasNamed = entries.some((entry) => entry.name !== "");
  const hasPositional = entries.some((entry) => entry.name === "");
  const kind = valueKind === "array" || (!hasNamed && hasPositional) ? "array" : "object";

  if (hasNamed && hasPositional) {
    return {
      kind: "property",
      name,
      valueKind: "object",
      raw: "",
      value: {
        __tagdbError: "mixed named and positional entries"
      },
      origin: tagdbOrigin(node)
    };
  }

  return {
    kind: "property",
    name,
    valueKind: kind,
    raw: "",
    value: kind === "array"
      ? entries.map((entry) => entry.value)
      : Object.fromEntries(entries.map((entry) => [entry.name, entry.value])),
    origin: tagdbOrigin(node)
  };
}

function bodyEntries(
  body: AnyNode[],
  properties: PropertyDefinitionMap
): Array<{name: string; value: JsonValue | string}> {
  const entries: Array<{name: string; value: JsonValue | string}> = [];
  let index = 0;

  while (index < body.length) {
    const node = body[index];

    if (node.type === "tagdbProperty") {
      const nested = collectPropertyEntryBody(body, index);
      const attachment = propertyAttachment(node, nested.children, properties);
      entries.push({name: attachment.name, value: attachment.value});
      index += 1 + nested.count;
      continue;
    }

    if (node.type === "code") {
      entries.push(...codeEntries(node, properties));
    }

    index++;
  }

  return entries;
}

function collectPropertyEntryBody(children: AnyNode[], index: number): {children: AnyNode[]; count: number} {
  const head = children[index];
  const headColumn = head.position?.start.column || 1;
  const body: AnyNode[] = [];
  let offset = index + 1;

  while (offset < children.length) {
    const candidate = children[offset];
    const column = candidate.position?.start.column || 1;
    const codeContinuation =
      candidate.type === "code" &&
      (propertyHasEmptyValue(head) || propertyHasEmptyValue(body[body.length - 1]));
    if (candidate.type === "tagdbProperty" && column <= headColumn) break;
    if (column <= headColumn && !codeContinuation) break;
    body.push(candidate);
    offset++;
  }

  return {children: body, count: body.length};
}

function codeEntries(node: AnyNode, properties: PropertyDefinitionMap): Array<{name: string; value: JsonValue | string}> {
  if (typeof node.value !== "string") return [];
  return parseStructuredLines(node.value.split(/\r?\n/), properties, 0, 0).entries;
}

function parseStructuredLines(
  lines: string[],
  properties: PropertyDefinitionMap,
  start: number,
  indent: number
): {entries: Array<{name: string; value: JsonValue | string}>; index: number} {
  const entries: Array<{name: string; value: JsonValue | string}> = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (/^[ \t]*$/.test(line)) {
      index++;
      continue;
    }

    const lineIndent = leadingSpaces(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) break;

    const entry = parseStructuredLine(line.slice(lineIndent), properties);
    if (!entry) break;

    index++;

    let value: JsonValue | string = parseScalarValue(entry.raw);
    if (entry.raw === "" && index < lines.length) {
      const nextIndent = nextNonBlankIndent(lines, index);
      if (nextIndent !== undefined && nextIndent > lineIndent) {
        const nested = parseStructuredLines(lines, properties, index, nextIndent);
        value = valueFromEntries(nested.entries, properties.get(entry.name)?.valueKind);
        index = nested.index;
      }
    }

    entries.push({name: entry.name, value});
  }

  return {entries, index};
}

function parseStructuredLine(
  value: string,
  properties: PropertyDefinitionMap
): {name: string; raw: string} | undefined {
  const match = /^(?:(::)|([A-Za-z][A-Za-z0-9_-]*)::)\s*(.*)$/.exec(value);
  if (!match) return undefined;
  const name = match[1] ? "" : match[2];
  if (name && !properties.has(name)) return undefined;
  return {name, raw: match[3] || ""};
}

function valueFromEntries(
  entries: Array<{name: string; value: JsonValue | string}>,
  valueKind: TagdbPropertyValueKind | undefined
): JsonValue {
  const hasNamed = entries.some((entry) => entry.name !== "");
  const hasPositional = entries.some((entry) => entry.name === "");

  if (hasNamed && hasPositional) {
    return {__tagdbError: "mixed named and positional entries"};
  }

  if (valueKind === "array" || (!hasNamed && hasPositional)) {
    return entries.map((entry) => entry.value) as JsonValue[];
  }

  return Object.fromEntries(entries.map((entry) => [entry.name, entry.value])) as {[key: string]: JsonValue};
}

function leadingSpaces(value: string): number {
  const match = /^ */.exec(value);
  return match ? match[0].length : 0;
}

function nextNonBlankIndent(lines: string[], start: number): number | undefined {
  let index = start;
  while (index < lines.length) {
    if (!/^[ \t]*$/.test(lines[index])) return leadingSpaces(lines[index]);
    index++;
  }

  return undefined;
}

function inferBodyKind(body: AnyNode[]): TagdbPropertyValueKind {
  const propertyNodes = body.filter((node) => node.type === "tagdbProperty");
  if (propertyNodes.length === body.length && propertyNodes.length > 0) {
    return propertyNodes.every((node) => (((node.data?.tagdb || {}) as {name?: string}).name || "") === "")
      ? "array"
      : "object";
  }

  if (body.length === 1 && body[0].type === "code") return "object";
  return "markdown";
}

function tagAttachment(node: AnyNode): TagdbTagAttachment {
  return {
    kind: "tag",
    name: typeof node.value === "string" ? node.value : "",
    origin: tagdbOrigin(node)
  };
}

function appendAttachments(node: AnyNode, attachments: TagdbAttachment[]): void {
  if (attachments.length === 0) return;
  const data = node.data || (node.data = {});
  const tagdb = (data.tagdb || (data.tagdb = {})) as {
    attachments?: TagdbAttachment[];
  };
  const target = node.type === "root" ? undefined : rangeFromPosition(node.position);
  const next = attachments.map((attachment) => withTarget(attachment, target));

  tagdb.attachments = [...(tagdb.attachments || []), ...next];
}

function withPlacement(
  attachments: TagdbAttachment[],
  placement: TagdbAttachmentPlacement
): TagdbAttachment[] {
  return attachments.map((attachment) => ({...attachment, placement}) as TagdbAttachment);
}

function withTarget(attachment: TagdbAttachment, target: TagdbSourceRange | undefined): TagdbAttachment {
  return target ? ({...attachment, target} as TagdbAttachment) : attachment;
}

function isDetachedAttachmentParagraph(node: AnyNode): boolean {
  if (node.type !== "paragraph") return false;
  const result = extractInlineAttachments(cloneNode(node));
  return result.detached && result.attachments.length > 0;
}

function trimTrailingSpace(children: AnyNode[]): void {
  const tail = children[children.length - 1];

  if (tail && tail.type === "text" && typeof tail.value === "string") {
    tail.value = tail.value.replace(/[ \t]+$/, "");
  }
}

function isWhitespaceText(node: AnyNode): boolean {
  return node.type === "text" && typeof node.value === "string" && /^[ \t\n]*$/.test(node.value);
}

function isLineEndingOnlyText(node: AnyNode): boolean {
  return node.type === "text" && typeof node.value === "string" && /^[\r\n]*$/.test(node.value);
}

function isEmptyText(node: AnyNode): boolean {
  return node.type === "text" && node.value === "";
}

function decodeEscapes(value: string): string {
  return value.replace(/\\([\s\S])/g, "$1");
}

function parseScalarValue(raw: string): string {
  if (raw.length >= 2) {
    const quote = raw.charAt(0);
    if ((quote === '"' || quote === "'") && raw.charAt(raw.length - 1) === quote) {
      return decodeEscapes(raw.slice(1, -1));
    }
  }

  return raw;
}

function mergeTextNodes(children: AnyNode[]): AnyNode[] {
  const merged: AnyNode[] = [];

  for (const child of children) {
    const tail = merged[merged.length - 1];

    if (
      tail &&
      tail.type === "text" &&
      child.type === "text" &&
      typeof tail.value === "string" &&
      typeof child.value === "string"
    ) {
      tail.value += child.value;
    } else {
      merged.push(child);
    }
  }

  return merged;
}

function markdownValue(children: Content[]): string {
  return toMarkdown({type: "root", children}).replace(/\n$/, "");
}

function cloneContent(nodes: AnyNode[]): Content[] {
  return nodes.map((node) => cloneNode(node) as Content);
}

function cloneNode<T extends AnyNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function normalizePropertyDefinitions(properties: RemarkTagdbOptions["properties"]): PropertyDefinitionMap {
  const map: PropertyDefinitionMap = new Map();
  if (!properties) return map;

  if (properties instanceof Set || Array.isArray(properties)) {
    for (const name of properties) map.set(name, {valueKind: "scalar"});
    return map;
  }

  for (const [name, definition] of Object.entries(properties)) {
    map.set(name, {valueKind: definition.valueKind || "scalar"});
  }

  return map;
}

function safeSliceSerialize(context: CompileContext, token: Token): string {
  try {
    return context.sliceSerialize(token);
  } catch {
    return "";
  }
}

function tagdbOrigin(node: AnyNode): TagdbSourceRange | undefined {
  const tagdb = (node.data?.tagdb || {}) as {origin?: TagdbSourceRange};
  return tagdb.origin || rangeFromPosition(node.position);
}

function rangeFromToken(token: Token): TagdbSourceRange {
  return {
    start: pointFromTokenPoint(token.start),
    end: pointFromTokenPoint(token.end)
  };
}

function rangeFromPosition(position: Position | undefined): TagdbSourceRange | undefined {
  if (!position) return undefined;
  return {
    start: pointFromTokenPoint(position.start),
    end: pointFromTokenPoint(position.end)
  };
}

function pointFromTokenPoint(point: Point): Point {
  return {
    line: point.line,
    column: point.column,
    offset: point.offset
  };
}
