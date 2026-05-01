import type {Root} from "mdast";
import type {
  CompileContext,
  Extension,
  Handle,
  Transform
} from "mdast-util-from-markdown";
import type {Token} from "micromark-util-types";
import type {TagdbTagNode} from "../types.js";

type AnyNode = {
  type: string;
  value?: string;
  children?: AnyNode[];
  data?: Record<string, unknown>;
};

export function tagdbFromMarkdown(): Extension {
  return {
    enter: {
      tagdbTag: enterTag
    },
    exit: {
      tagdbTagName: exitTagName,
      tagdbTag: exitTag
    },
    transforms: [attachTags as Transform]
  };
}

const enterTag: Handle = function enterTag(this: CompileContext, token: Token) {
  this.enter({type: "tagdbTag", value: ""} as never, token);
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

function attachTags(tree: Root): Root {
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
      const result = extractTags(child);

      if (result.tags.length > 0) {
        if (result.detached) {
          const target = findPreviousEligible(parent.children, index);

          if (target) {
            appendTags(target, result.tags);
            parent.children.splice(index, 1);
            continue;
          }
        } else {
          child.children = result.children;
          appendTags(child, result.tags);
        }
      }
    }

    index++;
  }
}

function isPhrasingBlock(node: AnyNode): boolean {
  return node.type === "paragraph" || node.type === "heading";
}

function extractTags(node: AnyNode): {
  children: AnyNode[];
  detached: boolean;
  tags: string[];
} {
  const children = node.children || [];
  const tags: string[] = [];
  const nextChildren: AnyNode[] = [];
  let hasNonTagContent = false;
  let removedTag = false;

  for (const child of children) {
    if (child.type === "tagdbTag") {
      if (typeof child.value === "string") tags.push(child.value);
      removedTag = true;
      trimTrailingSpace(nextChildren);
      continue;
    }

    if (isWhitespaceText(child)) {
      if (removedTag) continue;
      nextChildren.push(child);
      continue;
    }

    hasNonTagContent = true;

    if (removedTag && child.type === "text" && typeof child.value === "string") {
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
    removedTag = false;
  }

  return {
    children: mergeTextNodes(nextChildren.filter((child) => !isEmptyText(child))),
    detached: node.type === "paragraph" && !hasNonTagContent,
    tags
  };
}

function findPreviousEligible(children: AnyNode[], before: number): AnyNode | undefined {
  let index = before;
  while (index > 0) {
    const candidate = children[--index];
    if (candidate && candidate.type !== "tagdbTag") return candidate;
  }

  return undefined;
}

function appendTags(node: AnyNode, tags: string[]): void {
  const data = node.data || (node.data = {});
  const tagdb = (data.tagdb || (data.tagdb = {})) as {tags?: string[]};
  tagdb.tags = [...(tagdb.tags || []), ...tags];
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
