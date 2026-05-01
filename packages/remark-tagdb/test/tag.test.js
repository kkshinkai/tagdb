import assert from "node:assert/strict";
import test from "node:test";
import {remark} from "remark";
import remarkTagdb from "../dist/index.js";

function processor(tags = ["Decision", "Task", "Review Required"]) {
  return remark().use(remarkTagdb, {tags});
}

function parse(value, tags) {
  return processor(tags).parse(value);
}

function roundtrip(value, tags) {
  return String(processor(tags).processSync(value));
}

function child(value, index = 0, tags) {
  return parse(value, tags).children[index];
}

function simpleChildren(node) {
  return node.children.map((child) => {
    if (child.type === "text") return {type: child.type, value: child.value};
    if (child.type === "tagdbTag") return {type: child.type, value: child.value};
    return {type: child.type};
  });
}

test("attaches an inline tag to a paragraph", () => {
  const node = child("Runtime prompt boundary #Decision");

  assert.equal(node.type, "paragraph");
  assert.deepEqual(node.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.equal(roundtrip("Runtime prompt boundary #Decision"), "Runtime prompt boundary #Decision\n");
});

test("attaches multiple inline tags in order", () => {
  const node = child("Runtime prompt boundary #Decision #Task");

  assert.deepEqual(node.data.tagdb.tags, ["Decision", "Task"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
});

test("keeps undefined hashtag-like text as ordinary Markdown text", () => {
  const node = child("Runtime prompt boundary #Unknown");

  assert.equal(node.type, "paragraph");
  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary #Unknown"}]);
  assert.equal(roundtrip("Runtime prompt boundary #Unknown"), "Runtime prompt boundary #Unknown\n");
});

test("does not reinterpret C# or undefined region markers", () => {
  const node = child("C# example: #region generated code #Decision");

  assert.deepEqual(node.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "C# example: #region generated code"}]);
});

test("does not parse URL fragments as tags", () => {
  const node = child("See https://example.com/#Decision for details");

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "See https://example.com/#Decision for details"}]);
});

test("does not conflict with ATX heading markers", () => {
  const node = child("# Heading");

  assert.equal(node.type, "heading");
  assert.equal(node.depth, 1);
  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Heading"}]);
});

test("attaches an inline tag inside a heading", () => {
  const node = child("# Heading #Decision");

  assert.equal(node.type, "heading");
  assert.equal(node.depth, 1);
  assert.deepEqual(node.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Heading"}]);
  assert.equal(roundtrip("# Heading #Decision"), "# Heading #Decision\n");
});

test("does not detach a heading whose content is only a tag", () => {
  const tree = parse("Intro\n\n### #Decision");
  const heading = tree.children[1];

  assert.equal(heading.type, "heading");
  assert.deepEqual(heading.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(heading.children, []);
  assert.equal(roundtrip("Intro\n\n### #Decision"), "Intro\n\n### #Decision\n");
});

test("attaches a detached tag-only paragraph to the previous block", () => {
  const tree = parse("Runtime prompt boundary\n\n#Decision");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(tree.children[0].data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(tree.children[0]), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.equal(roundtrip("Runtime prompt boundary\n\n#Decision"), "Runtime prompt boundary #Decision\n");
});

test("treats whitespace around detached tags as non-content", () => {
  const tree = parse("Runtime prompt boundary\n\n  #Decision   ");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(tree.children[0].data.tagdb.tags, ["Decision"]);
});

test("attaches multiple detached tags to the previous block", () => {
  const tree = parse("Runtime prompt boundary\n\n#Decision #Task");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(tree.children[0].data.tagdb.tags, ["Decision", "Task"]);
});

test("keeps a leading detached tag when no previous block exists", () => {
  const tree = parse("#Decision\n\nRuntime prompt boundary");

  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].type, "paragraph");
  assert.deepEqual(simpleChildren(tree.children[0]), [{type: "tagdbTag", value: "Decision"}]);
});

test("supports quoted tag names", () => {
  const node = child('Runtime prompt boundary #"Review Required"');

  assert.deepEqual(node.data.tagdb.tags, ["Review Required"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.equal(roundtrip('Runtime prompt boundary #"Review Required"'), 'Runtime prompt boundary #"Review Required"\n');
});

test("supports single-quoted tag names", () => {
  const node = child("Runtime prompt boundary #'Review Required'");

  assert.deepEqual(node.data.tagdb.tags, ["Review Required"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
});

test("supports escaped closing quotes inside double-quoted tag names", () => {
  const node = child('Runtime boundary #"Review \\"Required\\""', 0, [
    'Review "Required"'
  ]);

  assert.deepEqual(node.data.tagdb.tags, ['Review "Required"']);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
});

test("supports escaped closing quotes inside single-quoted tag names", () => {
  const node = child("Runtime boundary #'Review \\'Required\\''", 0, [
    "Review 'Required'"
  ]);

  assert.deepEqual(node.data.tagdb.tags, ["Review 'Required'"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
});

test("treats markdown markers inside quoted tag names as literal tag text", () => {
  const tag = "Review `Required` *Now* [x]";
  const node = child('Runtime boundary #"Review `Required` *Now* [x]"', 0, [
    tag
  ]);

  assert.deepEqual(node.data.tagdb.tags, [tag]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
  assert.equal(node.children.length, 1);
});

test("quoted tag names take priority over inline code parsing", () => {
  const tag = "Code `tick`";
  const node = child('Runtime boundary #"Code `tick`"', 0, [tag]);

  assert.deepEqual(node.data.tagdb.tags, [tag]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
  assert.equal(node.children.some((item) => item.type === "inlineCode"), false);
});

test("leaves undefined quoted tag names as ordinary Markdown text", () => {
  const node = child('Runtime prompt boundary #"Not Defined"');

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: 'Runtime prompt boundary #"Not Defined"'}]);
});

test("removes inline tags from the middle without leaving double spaces", () => {
  const node = child("Before #Decision after");

  assert.deepEqual(node.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Before after"}]);
  assert.equal(roundtrip("Before #Decision after"), "Before after #Decision\n");
});

test("does not insert a space before punctuation after a removed tag", () => {
  const node = child("Runtime boundary #Decision.");

  assert.deepEqual(node.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary."}]);
  assert.equal(roundtrip("Runtime boundary #Decision."), "Runtime boundary. #Decision\n");
});

test("does not parse tag prefixes inside longer names", () => {
  const node = child("Runtime boundary #DecisionLater");

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary #DecisionLater"}]);
});

test("treats tag names as case-sensitive", () => {
  const node = child("Runtime boundary #decision");

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary #decision"}]);
});

test("supports hyphen and underscore in defined tag names", () => {
  const node = child("Runtime boundary #Prompt-Boundary #Review_Required", 0, [
    "Prompt-Boundary",
    "Review_Required"
  ]);

  assert.deepEqual(node.data.tagdb.tags, ["Prompt-Boundary", "Review_Required"]);
});

test("does not parse escaped number signs as tags", () => {
  const node = child("Runtime boundary \\#Decision");

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary #Decision"}]);
});

test("does not parse tags inside inline code", () => {
  const node = child("Runtime `#Decision` boundary");

  assert.equal(node.data, undefined);
  assert.equal(node.children[1].type, "inlineCode");
  assert.equal(node.children[1].value, "#Decision");
});

test("attaches a leading inline tag to its paragraph when text follows", () => {
  const node = child("#Decision Runtime boundary");

  assert.deepEqual(node.data.tagdb.tags, ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
});

test("attaches a detached tag-only paragraph to a previous heading", () => {
  const tree = parse("# Runtime boundary\n\n#Decision");

  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].type, "heading");
  assert.deepEqual(tree.children[0].data.tagdb.tags, ["Decision"]);
  assert.equal(roundtrip("# Runtime boundary\n\n#Decision"), "# Runtime boundary #Decision\n");
});
