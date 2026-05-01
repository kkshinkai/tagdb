import type {Root} from "mdast";
import type {Point, Position} from "unist";
import type {
  CompileContext,
  Extension,
  Handle,
  Transform
} from "mdast-util-from-markdown";
import type {Token} from "micromark-util-types";
import type {
  JsonValue,
  TagdbAttachment,
  TagdbPropertyAttachment,
  TagdbPropertyNode,
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

export function tagdbFromMarkdown(): Extension {
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
    transforms: [attachTagdb as Transform]
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
  const raw = this.sliceSerialize(token).trim();
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

function attachTagdb(tree: Root): Root {
  processChildren(tree as AnyNode);
  return tree;
}

function processChildren(parent: AnyNode): void {
  if (!parent.children) return;

  let index = 0;
  while (index < parent.children.length) {
    const child = parent.children[index];

    processChildren(child);

    if (isPhrasingBlock(child)) {
      const result = extractInlineAttachments(child);

      if (result.attachments.length > 0) {
        if (result.detached) {
          const target = findPreviousEligible(parent.children, index);

          if (target) {
            appendAttachments(target, result.attachments);
            parent.children.splice(index, 1);
            continue;
          }
        } else {
          child.children = result.children;
          appendAttachments(child, result.attachments);
        }
      }
    } else if (child.type === "tagdbProperty") {
      const attachment = propertyAttachment(child);
      const target = findPreviousEligible(parent.children, index);

      if (target) {
        appendAttachments(target, [attachment]);
        parent.children.splice(index, 1);
        continue;
      }
    }

    index++;
  }
}

function isPhrasingBlock(node: AnyNode): boolean {
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
      attachments.push(propertyAttachment(child));
      removedAttachment = true;
      trimTrailingSpace(nextChildren);
      continue;
    }

    if (isWhitespaceText(child)) {
      if (removedAttachment) continue;
      nextChildren.push(child);
      continue;
    }

    hasNonAttachmentContent = true;

    if (removedAttachment && child.type === "text" && typeof child.value === "string") {
      child.value = child.value.replace(/^[ \t]+/, "");

      const previous = nextChildren[nextChildren.length - 1];
      if (
        previous &&
        previous.type === "text" &&
        typeof previous.value === "string" &&
        previous.value.length > 0 &&
        child.value.length > 0 &&
        !/[ \t]$/.test(previous.value) &&
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

function findPreviousEligible(children: AnyNode[], before: number): AnyNode | undefined {
  let index = before;
  while (index > 0) {
    const candidate = children[--index];
    if (candidate && isEligibleBlock(candidate)) return candidate;
    if (candidate && !isInvisibleForAttachmentSearch(candidate)) return undefined;
  }

  return undefined;
}

function isEligibleBlock(node: AnyNode): boolean {
  return node.type === "paragraph" || node.type === "heading";
}

function isInvisibleForAttachmentSearch(node: AnyNode): boolean {
  return node.type === "tagdbProperty";
}

function appendAttachments(node: AnyNode, attachments: TagdbAttachment[]): void {
  const data = node.data || (node.data = {});
  const tagdb = (data.tagdb || (data.tagdb = {})) as {
    attachments?: TagdbAttachment[];
  };
  const target = rangeFromPosition(node.position);
  const next = attachments.map((attachment) => withTarget(attachment, target));

  tagdb.attachments = [...(tagdb.attachments || []), ...next];
}

function withTarget(attachment: TagdbAttachment, target: TagdbSourceRange | undefined): TagdbAttachment {
  return {...attachment, target} as TagdbAttachment;
}

function tagAttachment(node: AnyNode): TagdbTagAttachment {
  return {
    kind: "tag",
    name: typeof node.value === "string" ? node.value : "",
    origin: tagdbOrigin(node)
  };
}

function propertyAttachment(node: AnyNode): TagdbPropertyAttachment {
  const tagdb = (node.data?.tagdb || {}) as {
    name?: string;
    origin?: TagdbSourceRange;
    raw?: string;
    value?: JsonValue;
    valueKind?: "scalar";
  };

  return {
    kind: "property",
    name: tagdb.name || "",
    valueKind: "scalar",
    raw: tagdb.raw || "",
    value: tagdb.value ?? "",
    origin: tagdb.origin
  };
}

function tagdbOrigin(node: AnyNode): TagdbSourceRange | undefined {
  const tagdb = (node.data?.tagdb || {}) as {origin?: TagdbSourceRange};
  return tagdb.origin || rangeFromPosition(node.position);
}

function trimTrailingSpace(children: AnyNode[]): void {
  const tail = children[children.length - 1];

  if (tail && tail.type === "text" && typeof tail.value === "string") {
    tail.value = tail.value.replace(/[ \t]+$/, "");
  }
}

function isWhitespaceText(node: AnyNode): boolean {
  return node.type === "text" && typeof node.value === "string" && /^[ \t]*$/.test(node.value);
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
