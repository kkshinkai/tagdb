import assert from "node:assert/strict";
import test from "node:test";
import {remark} from "remark";
import remarkTagdb from "../dist/index.js";

const defaultTags = ["Decision", "Task", "Review Required"];
const defaultProperties = ["Status", "Visibility", "Title", "Review Status", "Owner", "Description"];

function processor(tags = defaultTags, properties = defaultProperties) {
  return remark().use(remarkTagdb, {tags, properties});
}

function parse(value, tags, properties) {
  return processor(tags, properties).parse(value);
}

function roundtrip(value, tags, properties) {
  return String(processor(tags, properties).processSync(value));
}

function child(value, index = 0, tags, properties) {
  return parse(value, tags, properties).children[index];
}

function simpleChildren(node) {
  return node.children.map((child) => {
    if (child.type === "text") return {type: child.type, value: child.value};
    if (child.type === "tagdbTag") return {type: child.type, value: child.value};
    if (child.type === "tagdbProperty") {
      return {type: child.type, name: child.data?.tagdb?.name, value: child.data?.tagdb?.value};
    }
    return {type: child.type};
  });
}

function attachments(node) {
  return node.data?.tagdb?.attachments || [];
}

function tagNames(node) {
  return attachments(node)
    .filter((attachment) => attachment.kind === "tag")
    .map((attachment) => attachment.name);
}

function propertyValues(node) {
  return Object.fromEntries(
    attachments(node)
      .filter((attachment) => attachment.kind === "property")
      .map((attachment) => [attachment.name, attachment.value])
  );
}

function property(node, name) {
  return attachments(node).find((attachment) => attachment.kind === "property" && attachment.name === name);
}

function assertMapped(attachment) {
  assert.equal(typeof attachment.origin?.start.line, "number");
  assert.equal(typeof attachment.origin?.end.column, "number");
  assert.equal(typeof attachment.target?.start.line, "number");
  assert.equal(typeof attachment.target?.end.column, "number");
}

test("attaches an inline tag to a paragraph", () => {
  const node = child("Runtime prompt boundary #Decision");
  const tag = attachments(node)[0];

  assert.equal(node.type, "paragraph");
  assert.deepEqual(tagNames(node), ["Decision"]);
  assert.equal(tag.kind, "tag");
  assertMapped(tag);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.equal(roundtrip("Runtime prompt boundary #Decision"), "Runtime prompt boundary #Decision\n");
});

test("attaches multiple inline tags in order", () => {
  const node = child("Runtime prompt boundary #Decision #Task");

  assert.deepEqual(tagNames(node), ["Decision", "Task"]);
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

  assert.deepEqual(tagNames(node), ["Decision"]);
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
  assert.deepEqual(tagNames(node), ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Heading"}]);
  assert.equal(roundtrip("# Heading #Decision"), "# Heading #Decision\n");
});

test("does not detach a heading whose content is only a tag", () => {
  const tree = parse("Intro\n\n### #Decision");
  const heading = tree.children[1];

  assert.equal(heading.type, "heading");
  assert.deepEqual(tagNames(heading), ["Decision"]);
  assert.deepEqual(heading.children, []);
  assert.equal(roundtrip("Intro\n\n### #Decision"), "Intro\n\n### #Decision\n");
});

test("attaches a detached tag-only paragraph to the previous block", () => {
  const tree = parse("Runtime prompt boundary\n\n#Decision");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(tagNames(tree.children[0]), ["Decision"]);
  assertMapped(attachments(tree.children[0])[0]);
  assert.deepEqual(simpleChildren(tree.children[0]), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.equal(roundtrip("Runtime prompt boundary\n\n#Decision"), "Runtime prompt boundary #Decision\n");
});

test("treats whitespace around detached tags as non-content", () => {
  const tree = parse("Runtime prompt boundary\n\n  #Decision   ");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(tagNames(tree.children[0]), ["Decision"]);
});

test("attaches multiple detached tags to the previous block", () => {
  const tree = parse("Runtime prompt boundary\n\n#Decision #Task");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(tagNames(tree.children[0]), ["Decision", "Task"]);
});

test("keeps a leading detached tag when no previous block exists", () => {
  const tree = parse("#Decision\n\nRuntime prompt boundary");

  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].type, "paragraph");
  assert.deepEqual(simpleChildren(tree.children[0]), [{type: "tagdbTag", value: "Decision"}]);
});

test("supports quoted tag names", () => {
  const node = child('Runtime prompt boundary #"Review Required"');

  assert.deepEqual(tagNames(node), ["Review Required"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.equal(roundtrip('Runtime prompt boundary #"Review Required"'), 'Runtime prompt boundary #"Review Required"\n');
});

test("supports single-quoted tag names", () => {
  const node = child("Runtime prompt boundary #'Review Required'");

  assert.deepEqual(tagNames(node), ["Review Required"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
});

test("supports escaped closing quotes inside double-quoted tag names", () => {
  const node = child('Runtime boundary #"Review \\"Required\\""', 0, [
    'Review "Required"'
  ]);

  assert.deepEqual(tagNames(node), ['Review "Required"']);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
});

test("supports escaped closing quotes inside single-quoted tag names", () => {
  const node = child("Runtime boundary #'Review \\'Required\\''", 0, [
    "Review 'Required'"
  ]);

  assert.deepEqual(tagNames(node), ["Review 'Required'"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
});

test("treats markdown markers inside quoted tag names as literal tag text", () => {
  const tag = "Review `Required` *Now* [x]";
  const node = child('Runtime boundary #"Review `Required` *Now* [x]"', 0, [
    tag
  ]);

  assert.deepEqual(tagNames(node), [tag]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
  assert.equal(node.children.length, 1);
});

test("quoted tag names take priority over inline code parsing", () => {
  const tag = "Code `tick`";
  const node = child('Runtime boundary #"Code `tick`"', 0, [tag]);

  assert.deepEqual(tagNames(node), [tag]);
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

  assert.deepEqual(tagNames(node), ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Before after"}]);
  assert.equal(roundtrip("Before #Decision after"), "Before after #Decision\n");
});

test("does not insert a space before punctuation after a removed tag", () => {
  const node = child("Runtime boundary #Decision.");

  assert.deepEqual(tagNames(node), ["Decision"]);
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

  assert.deepEqual(tagNames(node), ["Prompt-Boundary", "Review_Required"]);
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

  assert.deepEqual(tagNames(node), ["Decision"]);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime boundary"}]);
});

test("attaches a detached tag-only paragraph to a previous heading", () => {
  const tree = parse("# Runtime boundary\n\n#Decision");

  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].type, "heading");
  assert.deepEqual(tagNames(tree.children[0]), ["Decision"]);
  assert.equal(roundtrip("# Runtime boundary\n\n#Decision"), "# Runtime boundary #Decision\n");
});

test("attaches a flow property line without a blank line", () => {
  const tree = parse("Runtime prompt boundary\nStatus:: Accepted");
  const node = tree.children[0];
  const status = property(node, "Status");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(propertyValues(node), {Status: "Accepted"});
  assert.equal(status.valueKind, "scalar");
  assert.equal(status.raw, "Accepted");
  assertMapped(status);
  assert.equal(roundtrip("Runtime prompt boundary\nStatus:: Accepted"), "Runtime prompt boundary\nStatus:: Accepted\n");
});

test("attaches multiple consecutive flow property lines to the same block", () => {
  const tree = parse("Runtime prompt boundary\nStatus:: Accepted\nVisibility:: Private");

  assert.equal(tree.children.length, 1);
  assert.deepEqual(propertyValues(tree.children[0]), {
    Status: "Accepted",
    Visibility: "Private"
  });
});

test("keeps a leading flow property line when no target exists", () => {
  const tree = parse("Status:: Accepted\n\nRuntime prompt boundary");

  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].type, "tagdbProperty");
  assert.equal(tree.children[0].data.tagdb.name, "Status");
  assert.equal(tree.children[0].data.tagdb.value, "Accepted");
});

test("does not treat undefined property lines as structured properties", () => {
  const tree = parse("Runtime prompt boundary\nUnknown:: Accepted");

  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].data, undefined);
  assert.deepEqual(simpleChildren(tree.children[0]), [{type: "text", value: "Runtime prompt boundary\nUnknown:: Accepted"}]);
});

test("does not let flow properties attach across thematic breaks", () => {
  const tree = parse("Runtime prompt boundary\n\n---\nStatus:: Accepted");

  assert.equal(tree.children.length, 3);
  assert.equal(tree.children[2].type, "tagdbProperty");
  assert.equal(tree.children[2].data.tagdb.name, "Status");
});

test("does not let flow properties attach across definitions", () => {
  const tree = parse("[x]: https://example.com\nStatus:: Accepted");

  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].type, "definition");
  assert.equal(tree.children[1].type, "tagdbProperty");
  assert.equal(tree.children[1].data.tagdb.name, "Status");
});

test("does not parse indented code as a flow property", () => {
  const tree = parse("    Status:: Accepted");

  assert.equal(tree.children[0].type, "code");
  assert.equal(tree.children[0].value, "Status:: Accepted");
});

test("attaches a flow property to the first paragraph inside a list item", () => {
  const tree = parse("- Runtime prompt boundary\n  Status:: Accepted");
  const paragraph = tree.children[0].children[0].children[0];

  assert.equal(paragraph.type, "paragraph");
  assert.deepEqual(propertyValues(paragraph), {Status: "Accepted"});
});

test("does not reinterpret C# or URLs as properties", () => {
  const node = child("C# example and https://example.com/Status:: Accepted");

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "C# example and https://example.com/Status:: Accepted"}]);
});

test("attaches an inline scalar property to a paragraph", () => {
  const node = child("Runtime prompt boundary Status:: Accepted");
  const status = property(node, "Status");

  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
  assert.deepEqual(propertyValues(node), {Status: "Accepted"});
  assert.equal(status.kind, "property");
  assert.equal(status.valueKind, "scalar");
  assert.equal(status.raw, "Accepted");
  assertMapped(status);
});

test("attaches inline tag and inline property together", () => {
  const node = child("Runtime prompt boundary #Decision Status:: Accepted");

  assert.deepEqual(tagNames(node), ["Decision"]);
  assert.deepEqual(propertyValues(node), {Status: "Accepted"});
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary"}]);
});

test("keeps undefined inline property names as ordinary Markdown text", () => {
  const node = child("Runtime prompt boundary Unknown:: Accepted");

  assert.equal(node.data, undefined);
  assert.deepEqual(simpleChildren(node), [{type: "text", value: "Runtime prompt boundary Unknown:: Accepted"}]);
});

test("supports quoted property names", () => {
  const node = child('Runtime prompt boundary "Review Status":: Accepted');

  assert.deepEqual(propertyValues(node), {"Review Status": "Accepted"});
  assert.equal(roundtrip('Runtime prompt boundary "Review Status":: Accepted'), 'Runtime prompt boundary\n"Review Status":: Accepted\n');
});

test("supports quoted literal property values", () => {
  const node = child('Runtime prompt boundary Title:: "Runtime #Decision Status:: Accepted"');
  const title = property(node, "Title");

  assert.equal(title.value, "Runtime #Decision Status:: Accepted");
  assert.equal(title.raw, '"Runtime #Decision Status:: Accepted"');
  assert.deepEqual(tagNames(node), []);
});

test("quoted property values keep backticks literal", () => {
  const node = child('Runtime prompt boundary Title:: "Use `code` here"');

  assert.equal(property(node, "Title").value, "Use `code` here");
  assert.equal(node.children.some((item) => item.type === "inlineCode"), false);
});

test("quoted property values keep tag-like text literal", () => {
  const node = child('Runtime prompt boundary Title:: "#Decision"');

  assert.equal(property(node, "Title").value, "#Decision");
  assert.deepEqual(tagNames(node), []);
});

test("escaped quotes do not close quoted property values early", () => {
  const node = child('Runtime prompt boundary Title:: "Runtime \\"Boundary\\""');

  assert.equal(property(node, "Title").value, 'Runtime "Boundary"');
});

test("does not parse flow properties inside fenced code", () => {
  const tree = parse("```md\nStatus:: Accepted\n```");

  assert.equal(tree.children[0].type, "code");
  assert.equal(tree.children[0].value, "Status:: Accepted");
});

test("does not parse properties inside inline code", () => {
  const node = child("Runtime `Status:: Accepted` boundary");

  assert.equal(node.data, undefined);
  assert.equal(node.children[1].type, "inlineCode");
  assert.equal(node.children[1].value, "Status:: Accepted");
});
